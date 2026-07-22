import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "crypto";
import { createReadStream, existsSync } from "fs";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { extname, join, resolve } from "path";
import { Readable } from "stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

export interface StoredObject {
  storageKey: string;
  sizeBytes: number;
}

/**
 * File storage abstraction. STORAGE_DRIVER=local writes under STORAGE_DIR;
 * STORAGE_DRIVER=s3 targets any S3-compatible service (AWS S3, MinIO, R2).
 * Private by default — downloads go through the authenticated API.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger("Storage");
  private s3: S3Client | null = null;
  private bucketReady = false;

  constructor() {
    if (env.STORAGE_DRIVER === "s3") {
      this.s3 = new S3Client({
        endpoint: env.S3_ENDPOINT || undefined,
        region: env.S3_REGION,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        credentials:
          env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
            ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
            : undefined,
      });
    }
  }

  get driver(): "local" | "s3" {
    return env.STORAGE_DRIVER;
  }

  newStorageKey(originalName: string): string {
    const ext = extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "");
    return `${Date.now().toString(36)}-${randomBytes(12).toString("hex")}${ext}`;
  }

  private localPath(storageKey: string): string {
    const base = resolve(env.STORAGE_DIR);
    const full = resolve(join(base, storageKey));
    if (!full.startsWith(base)) throw new Error("Invalid storage key");
    return full;
  }

  private async ensureBucket(): Promise<void> {
    if (!this.s3 || this.bucketReady) return;
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
      this.logger.log(`Created S3 bucket "${env.S3_BUCKET}"`);
    }
    this.bucketReady = true;
  }

  async put(storageKey: string, data: Buffer, mimeType: string): Promise<StoredObject> {
    if (this.s3) {
      await this.ensureBucket();
      await this.s3.send(
        new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey, Body: data, ContentType: mimeType }),
      );
      return { storageKey, sizeBytes: data.length };
    }
    const path = this.localPath(storageKey);
    await mkdir(resolve(env.STORAGE_DIR), { recursive: true });
    await writeFile(path, data);
    return { storageKey, sizeBytes: data.length };
  }

  async getBuffer(storageKey: string): Promise<Buffer> {
    if (this.s3) {
      const out = await this.s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }));
      const stream = out.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    }
    return readFile(this.localPath(storageKey));
  }

  getStream(storageKey: string): Readable {
    const path = this.localPath(storageKey);
    if (!existsSync(path)) throw new Error("File not found");
    return createReadStream(path);
  }

  async remove(storageKey: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey }));
      return;
    }
    await unlink(this.localPath(storageKey)).catch(() => undefined);
  }

  /** Presigned GET URL — only meaningful with the s3 driver. */
  async getSignedDownloadUrl(storageKey: string, originalName: string): Promise<string | null> {
    if (!this.s3) return null;
    await this.ensureBucket();
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: storageKey,
        ResponseContentDisposition: `attachment; filename*=UTF-8\'\'${encodeURIComponent(originalName.replace(/[\r\n]/g, ""))}`,
        ResponseContentType: "application/octet-stream",
      }),
      { expiresIn: env.SIGNED_URL_TTL },
    );
  }

  async healthCheck(): Promise<boolean> {
    if (this.s3) {
      try {
        await this.ensureBucket();
        return true;
      } catch {
        return false;
      }
    }
    try {
      await mkdir(resolve(env.STORAGE_DIR), { recursive: true });
      return true;
    } catch {
      return false;
    }
  }
}
