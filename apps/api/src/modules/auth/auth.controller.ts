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
  Req,
  Res,
  UsePipes,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { SESSION_COOKIE } from "@mep/config";
import {
  changeEmailSchema,
  changePasswordSchema,
  confirmEmailChangeSchema,
  deleteAccountSchema,
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from "@mep/validation";
import { AuthService, hashToken } from "./auth.service";
import { Public } from "../../common/decorators/public.decorator";
import { AllowUnverified } from "../../common/decorators/allow-unverified.decorator";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PrismaService } from "../../prisma/prisma.service";
import { env } from "../../config/env";

@ApiTags("auth")
@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  private setSessionCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.SESSION_COOKIE_SECURE,
      expires: expiresAt,
      path: "/",
    });
  }

  @Public()
  @Throttle({ default: { limit: env.AUTH_REGISTER_RATE_LIMIT, ttl: 60_000 } })
  @Post("register")
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = body as Parameters<AuthService["register"]>[0];
    const user = await this.auth.register(input);
    const { token, expiresAt } = await this.auth.createSession(user.id, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
    this.setSessionCookie(res, token, expiresAt);
    const { passwordHash: _omit, ...profile } = user;
    return profile;
  }

  @Public()
  @Throttle({ default: { limit: env.AUTH_LOGIN_RATE_LIMIT, ttl: 60_000 } })
  @HttpCode(200)
  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = body as Parameters<AuthService["login"]>[0];
    const user = await this.auth.login(input);
    const { token, expiresAt } = await this.auth.createSession(user.id, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
    this.setSessionCookie(res, token, expiresAt);
    const { passwordHash: _omit, ...profile } = user;
    return profile;
  }

  @AllowUnverified()
  @HttpCode(200)
  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  @AllowUnverified()
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user.id);
  }

  @Patch("me")
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: unknown,
  ) {
    return this.auth.updateProfile(user.id, body as Parameters<AuthService["updateProfile"]>[1]);
  }

  @HttpCode(200)
  @Post("change-password")
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(user.id, body as Parameters<AuthService["changePassword"]>[1]);
    const { token, expiresAt } = await this.auth.createSession(user.id, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
    this.setSessionCookie(res, token, expiresAt);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: env.AUTH_REGISTER_RATE_LIMIT, ttl: 60_000 } })
  @HttpCode(200)
  @Post("forgot-password")
  async forgotPassword(@Body(new ZodValidationPipe(requestPasswordResetSchema)) body: unknown) {
    const { email } = body as { email: string };
    await this.auth.requestPasswordReset(email);
    // Generic response — never reveal whether the account exists.
    return {
      ok: true,
      message: "If an account exists for this email, a reset link has been sent.",
    };
  }

  @Public()
  @Throttle({ default: { limit: env.AUTH_LOGIN_RATE_LIMIT, ttl: 60_000 } })
  @HttpCode(200)
  @Post("reset-password")
  async resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: unknown) {
    const { token, password } = body as { token: string; password: string };
    await this.auth.resetPassword(token, password);
    return { ok: true, message: "Your password has been reset. You can now log in." };
  }

  @Public()
  @HttpCode(200)
  @Post("verify-email")
  async verifyEmail(@Body() body: { token?: string }) {
    if (!body?.token || body.token.length < 16) {
      return { ok: false, message: "This verification link is invalid or has expired" };
    }
    await this.auth.verifyEmail(body.token);
    return { ok: true };
  }

  @AllowUnverified()
  @HttpCode(200)
  @Post("resend-verification")
  async resendVerification(@CurrentUser() user: AuthUser) {
    const profile = await this.auth.getProfile(user.id);
    if (!profile.emailVerifiedAt) {
      await this.auth.sendVerificationEmail(user.id, profile.email);
    }
    return { ok: true };
  }

  @HttpCode(200)
  @Post("change-email")
  async changeEmail(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changeEmailSchema)) body: unknown,
  ) {
    await this.auth.requestEmailChange(user.id, body as { newEmail: string; password: string });
    return { ok: true, message: "A confirmation link has been sent to the new email address." };
  }

  @Public()
  @HttpCode(200)
  @Post("confirm-email-change")
  async confirmEmailChange(@Body(new ZodValidationPipe(confirmEmailChangeSchema)) body: unknown) {
    const { token } = body as { token: string };
    await this.auth.confirmEmailChange(token);
    return { ok: true, message: "Your email address has been changed. Please sign in again." };
  }

  @Get("account-export")
  async exportAccount(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const data = await this.auth.exportAccountData(user.id);
    const json = JSON.stringify(
      data,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    );
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="my-event-planner-data-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.send(json);
  }

  @HttpCode(200)
  @Delete("account")
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(deleteAccountSchema)) body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.deleteAccount(user.id, body as { password: string; confirmation: "DELETE" });
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true, message: "Your account has been deleted." };
  }

  @Get("sessions")
  sessions(@CurrentUser() user: AuthUser, @Req() req: Request) {
    const currentHash = req.cookies?.[SESSION_COOKIE]
      ? hashToken(req.cookies[SESSION_COOKIE])
      : null;
    return this.auth.listSessions(user.id).then((sessions) =>
      this.prisma.session
        .findMany({
          where: { id: { in: sessions.map((s) => s.id) } },
          select: { id: true, tokenHash: true },
        })
        .then((rows) => {
          const currentId = rows.find((r) => r.tokenHash === currentHash)?.id ?? null;
          return sessions.map((s) => ({ ...s, current: s.id === currentId }));
        }),
    );
  }

  @HttpCode(200)
  @Delete("sessions/:id")
  async revokeSession(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    await this.auth.revokeSession(user.id, BigInt(id));
    return { ok: true };
  }
}
