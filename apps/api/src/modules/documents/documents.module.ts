import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { ScannerService } from "./scanner.service";

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, ScannerService],
})
export class DocumentsModule {}
