import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { EXPENSE_STATUSES } from "@mep/types";
import { createPaymentSchema, expenseUpsertSchema } from "@mep/validation";
import { ExpensesService } from "./expenses.service";
import { PaymentsService } from "../payments/payments.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

@ApiTags("expenses")
@Controller({ path: "events/:eventId/expenses", version: "1" })
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("categoryId") categoryId?: string,
    @Query("sort") sort?: string,
  ) {
    return this.expenses.list(user.id, BigInt(eventId), {
      q,
      status,
      categoryId: categoryId ? Number(categoryId) : undefined,
      sort,
    });
  }

  @Get("export")
  async exportCsv(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Res() res: Response,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("categoryId") categoryId?: string,
    @Query("sort") sort?: string,
  ) {
    const csv = await this.expenses.exportCsv(user.id, BigInt(eventId), {
      q,
      status,
      categoryId: categoryId ? Number(categoryId) : undefined,
      sort,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="expenses.csv"');
    res.send(csv);
  }

  @Get(":expenseId")
  getOne(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("expenseId", ParseIntPipe) expenseId: number,
  ) {
    return this.expenses.getOne(user.id, BigInt(eventId), BigInt(expenseId));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Body(new ZodValidationPipe(expenseUpsertSchema)) body: never,
  ) {
    return this.expenses.create(user.id, BigInt(eventId), body);
  }

  @Patch(":expenseId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("expenseId", ParseIntPipe) expenseId: number,
    @Body(new ZodValidationPipe(expenseUpsertSchema)) body: never,
  ) {
    return this.expenses.update(user.id, BigInt(eventId), BigInt(expenseId), body);
  }

  @HttpCode(200)
  @Post(":expenseId/status")
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("expenseId", ParseIntPipe) expenseId: number,
    @Body(new ZodValidationPipe(z.object({ status: z.enum(EXPENSE_STATUSES) })))
    body: { status: (typeof EXPENSE_STATUSES)[number] },
  ) {
    return this.expenses.setStatus(user.id, BigInt(eventId), BigInt(expenseId), body.status);
  }

  @HttpCode(200)
  @Post(":expenseId/restore")
  restore(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("expenseId", ParseIntPipe) expenseId: number,
  ) {
    return this.expenses.restore(user.id, BigInt(eventId), BigInt(expenseId));
  }

  @HttpCode(200)
  @Delete(":expenseId")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("expenseId", ParseIntPipe) expenseId: number,
  ) {
    return this.expenses.remove(user.id, BigInt(eventId), BigInt(expenseId));
  }

  @Post(":expenseId/payments")
  addPayment(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("expenseId", ParseIntPipe) expenseId: number,
    @Body(new ZodValidationPipe(createPaymentSchema)) body: never,
  ) {
    return this.payments.create(user.id, BigInt(eventId), BigInt(expenseId), body);
  }
}
