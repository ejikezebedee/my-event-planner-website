import { Injectable, Logger } from "@nestjs/common";
import { env } from "../../config/env";

export type ScanVerdict = "clean" | "infected";

/**
 * Malware-scanning abstraction (H2). Every uploaded document is scanned
 * after storage and carries a scanStatus (pending → clean | infected | error).
 *
 * - MALWARE_SCAN_URL set → the file is POSTed to that HTTP bridge (for
 *   example a ClamAV REST wrapper such as clamav-rest). Expected JSON:
 *   {"verdict":"clean"} or {"verdict":"infected"}.
 * - MALWARE_SCAN_URL empty → no-op engine (everything clean). Suitable for
 *   development and tests; wire a real engine for production deployments.
 *
 * Swap-in of another engine (SDK-based ClamAV, cloud scanning API) means
 * replacing this one class — call sites only know ScanVerdict.
 */
@Injectable()
export class ScannerService {
  private readonly logger = new Logger("Scanner");

  get engine(): string {
    return env.MALWARE_SCAN_URL ? "http-bridge" : "noop";
  }

  /** Throws when the scan itself fails (engine unreachable, bad response). */
  async scan(buffer: Buffer, filename: string): Promise<ScanVerdict> {
    if (!env.MALWARE_SCAN_URL) {
      if (env.NODE_ENV === "production") throw new Error("Malware scanner is not configured");
      return "clean";
    }
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)]), filename);
    const res = await fetch(env.MALWARE_SCAN_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`scanner bridge responded ${res.status}`);
    const body = (await res.json()) as { verdict?: string };
    this.logger.log(`Scanned "${filename}": ${body.verdict ?? "unknown"}`);
    if (body.verdict === "clean") return "clean";
    if (body.verdict === "infected") return "infected";
    throw new Error("scanner bridge returned an unknown verdict");
  }
}
