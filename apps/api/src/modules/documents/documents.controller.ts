import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { DocumentsService } from "./documents.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { env } from "../../config/env";

@ApiTags("documents")
@Controller({ version: "1" })
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get("events/:eventId/documents")
  list(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Query("expenseId") expenseId?: string,
    @Query("paymentId") paymentId?: string,
  ) {
    return this.documents.list(user.id, BigInt(eventId), {
      expenseId: expenseId ? Number(expenseId) : undefined,
      paymentId: paymentId ? Number(paymentId) : undefined,
    });
  }

  @Post("events/:eventId/documents")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @UploadedFile() file: { originalname: string; size: number; mimetype: string; buffer: Buffer },
    @Body()
    body: {
      category?: string;
      description?: string;
      expenseId?: string;
      paymentId?: string;
      linkedType?: string;
      linkedId?: string;
    },
  ) {
    return this.documents.upload(user.id, BigInt(eventId), file, {
      category: body?.category,
      description: body?.description,
      expenseId: body?.expenseId ? Number(body.expenseId) : undefined,
      paymentId: body?.paymentId ? Number(body.paymentId) : undefined,
      linkedType: body?.linkedType || undefined,
      linkedId: body?.linkedId ? Number(body.linkedId) : undefined,
    });
  }

  @Get("documents/:id/download")
  async download(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.documents.getDownload(user.id, BigInt(id));
    if (result.kind === "redirect") {
      res.redirect(result.url);
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(result.document.originalName)}`,
    );
    res.send(result.buffer);
  }

  @HttpCode(200)
  @Delete("documents/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.documents.remove(user.id, BigInt(id));
  }
}
