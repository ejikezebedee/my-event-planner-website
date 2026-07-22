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
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { eventVendorSchema, vendorUpsertSchema } from "@mep/validation";
import { VendorsService } from "./vendors.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

@ApiTags("vendors")
@Controller({ version: "1" })
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get("vendors")
  listWorkspace(
    @CurrentUser() user: AuthUser,
    @Query("workspaceId", ParseIntPipe) workspaceId: number,
    @Query("q") q?: string,
    @Query("category") category?: string,
    @Query("includeArchived") includeArchived?: string,
  ) {
    return this.vendors.listWorkspaceVendors(user.id, BigInt(workspaceId), {
      q,
      category,
      includeArchived: includeArchived === "true",
    });
  }

  @Get("vendors/:vendorId")
  getSummary(
    @CurrentUser() user: AuthUser,
    @Query("workspaceId", ParseIntPipe) workspaceId: number,
    @Param("vendorId", ParseIntPipe) vendorId: number,
  ) {
    return this.vendors.getVendorSummary(user.id, BigInt(workspaceId), BigInt(vendorId));
  }

  @Post("vendors")
  create(
    @CurrentUser() user: AuthUser,
    @Query("workspaceId", ParseIntPipe) workspaceId: number,
    @Body(new ZodValidationPipe(vendorUpsertSchema)) body: never,
  ) {
    return this.vendors.createVendor(user.id, BigInt(workspaceId), body);
  }

  @Patch("vendors/:vendorId")
  update(
    @CurrentUser() user: AuthUser,
    @Query("workspaceId", ParseIntPipe) workspaceId: number,
    @Param("vendorId", ParseIntPipe) vendorId: number,
    @Body(new ZodValidationPipe(vendorUpsertSchema)) body: never,
  ) {
    return this.vendors.updateVendor(user.id, BigInt(workspaceId), BigInt(vendorId), body);
  }

  @HttpCode(200)
  @Delete("vendors/:vendorId")
  archive(
    @CurrentUser() user: AuthUser,
    @Query("workspaceId", ParseIntPipe) workspaceId: number,
    @Param("vendorId", ParseIntPipe) vendorId: number,
  ) {
    return this.vendors.archiveVendor(user.id, BigInt(workspaceId), BigInt(vendorId));
  }

  @Get("events/:eventId/vendors")
  listEventVendors(@CurrentUser() user: AuthUser, @Param("eventId", ParseIntPipe) eventId: number) {
    return this.vendors.listEventVendors(user.id, BigInt(eventId));
  }

  @Post("events/:eventId/vendors")
  assign(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Body(new ZodValidationPipe(eventVendorSchema)) body: never,
  ) {
    return this.vendors.upsertEventVendor(user.id, BigInt(eventId), body);
  }

  @Patch("events/:eventId/vendors/:linkId")
  updateLink(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("linkId", ParseIntPipe) linkId: number,
    @Body(new ZodValidationPipe(eventVendorSchema)) body: never,
  ) {
    return this.vendors.upsertEventVendor(user.id, BigInt(eventId), body, BigInt(linkId));
  }

  @HttpCode(200)
  @Delete("events/:eventId/vendors/:linkId")
  removeLink(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("linkId", ParseIntPipe) linkId: number,
  ) {
    return this.vendors.removeEventVendor(user.id, BigInt(eventId), BigInt(linkId));
  }
}
