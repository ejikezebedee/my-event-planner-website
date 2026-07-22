import { Controller, Get, Header, Param, ParseIntPipe, Query, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { ReportsService, REPORT_TYPES, type ReportType } from "./reports.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { BadRequestException } from "@nestjs/common";

@ApiTags("reports")
@Controller({ path: "events/:eventId/reports", version: "1" })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private assertType(type: string): ReportType {
    if (!(REPORT_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(`Unknown report type. Valid: ${REPORT_TYPES.join(", ")}`);
    }
    return type as ReportType;
  }

  @Get(":type")
  async get(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("type") type: string,
    @Query("format") format: string = "json",
    @Res({ passthrough: true }) res: Response,
  ) {
    const reportType = this.assertType(type);
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${reportType}.csv"`);
      return this.reports.asCsv(user.id, BigInt(eventId), reportType);
    }
    if (format === "pdf") {
      const pdf = await this.reports.asPdf(user.id, BigInt(eventId), reportType);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${reportType}.pdf"`);
      res.send(pdf);
      return;
    }
    return this.reports.generate(user.id, BigInt(eventId), reportType);
  }
}
