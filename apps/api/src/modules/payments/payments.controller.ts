import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { createRefundSchema } from "@mep/validation";
import { PaymentsService } from "./payments.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

@ApiTags("payments")
@Controller({ path: "events/:eventId/payments", version: "1" })
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("eventId", ParseIntPipe) eventId: number) {
    return this.payments.listForEvent(user.id, BigInt(eventId));
  }

  @Post(":paymentId/refund")
  refund(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("paymentId", ParseIntPipe) paymentId: number,
    @Body(new ZodValidationPipe(createRefundSchema)) body: never,
  ) {
    return this.payments.refund(user.id, BigInt(eventId), BigInt(paymentId), body);
  }

  @HttpCode(200)
  @Post(":paymentId/reverse")
  reverse(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("paymentId", ParseIntPipe) paymentId: number,
    @Body(new ZodValidationPipe(z.object({ reason: z.string().trim().min(1).max(500) })))
    body: { reason: string },
  ) {
    return this.payments.reverse(user.id, BigInt(eventId), BigInt(paymentId), body.reason);
  }
}
