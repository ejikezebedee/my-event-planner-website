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
import type { WorkspaceRole } from "@prisma/client";
import { inviteSchema, transferOwnershipSchema, workspaceUpsertSchema } from "@mep/validation";
import { z } from "zod";
import { WorkspacesService } from "./workspaces.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

@ApiTags("workspaces")
@Controller({ path: "workspaces", version: "1" })
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.listForUser(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(workspaceUpsertSchema)) body: unknown,
  ) {
    return this.workspaces.create(user.id, body as { name: string; currency?: string; timezone?: string });
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(workspaceUpsertSchema.partial())) body: unknown,
  ) {
    return this.workspaces.update(user.id, BigInt(id), body as { name?: string; currency?: string; timezone?: string });
  }

  @Get(":id/members")
  members(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.workspaces.members(user.id, BigInt(id));
  }

  @Post(":id/invitations")
  invite(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(inviteSchema)) body: unknown,
  ) {
    const { email, role } = body as { email: string; role: WorkspaceRole };
    return this.workspaces.invite(user.id, BigInt(id), email, role);
  }

  @HttpCode(200)
  @Post("invitations/accept")
  acceptInvitation(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(z.object({ token: z.string().min(16) }))) body: unknown,
  ) {
    return this.workspaces.acceptInvitation(user.id, user.email, (body as { token: string }).token);
  }

  @Patch(":id/members/:memberId")
  updateMemberRole(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Param("memberId", ParseIntPipe) memberId: number,
    @Body(new ZodValidationPipe(z.object({ role: z.enum(["admin", "planner", "viewer"]) }))) body: unknown,
  ) {
    return this.workspaces.updateMemberRole(user.id, BigInt(id), BigInt(memberId), (body as { role: WorkspaceRole }).role);
  }

  @HttpCode(200)
  @Post(":id/transfer-ownership")
  transferOwnership(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(transferOwnershipSchema)) body: unknown,
  ) {
    const input = body as { memberId: number; password: string };
    return this.workspaces.transferOwnership(user.id, BigInt(id), BigInt(input.memberId), input.password);
  }

  @HttpCode(200)
  @Delete(":id/members/:memberId")
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Param("memberId", ParseIntPipe) memberId: number,
  ) {
    return this.workspaces.removeMember(user.id, BigInt(id), BigInt(memberId));
  }
}
