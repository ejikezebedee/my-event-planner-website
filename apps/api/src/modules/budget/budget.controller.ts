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
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { budgetItemSchema } from "@mep/validation";
import { BudgetService } from "./budget.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

@ApiTags("budget")
@Controller({ path: "events/:eventId/budget", version: "1" })
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  @Get()
  getBudget(@CurrentUser() user: AuthUser, @Param("eventId", ParseIntPipe) eventId: number) {
    return this.budget.getBudget(user.id, BigInt(eventId));
  }

  @Post("categories")
  createCategory(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Body(new ZodValidationPipe(z.object({ name: z.string().trim().min(1).max(128) })))
    body: { name: string },
  ) {
    return this.budget.createCategory(user.id, BigInt(eventId), body.name);
  }

  @HttpCode(200)
  @Delete("categories/:categoryId")
  deleteCategory(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("categoryId", ParseIntPipe) categoryId: number,
  ) {
    return this.budget.deleteCategory(user.id, BigInt(eventId), BigInt(categoryId));
  }

  @Post("items")
  createItem(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Body(new ZodValidationPipe(budgetItemSchema)) body: never,
  ) {
    return this.budget.upsertItem(user.id, BigInt(eventId), body);
  }

  @Patch("items/:itemId")
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("itemId", ParseIntPipe) itemId: number,
    @Body(new ZodValidationPipe(budgetItemSchema)) body: never,
  ) {
    return this.budget.upsertItem(user.id, BigInt(eventId), body, BigInt(itemId));
  }

  @HttpCode(200)
  @Delete("items/:itemId")
  deleteItem(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("itemId", ParseIntPipe) itemId: number,
  ) {
    return this.budget.deleteItem(user.id, BigInt(eventId), BigInt(itemId));
  }
}
