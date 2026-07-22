import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "crypto";
import type { Request } from "express";
import { SESSION_COOKIE } from "@mep/config";
import { PrismaService } from "../../prisma/prisma.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { ALLOW_UNVERIFIED_KEY } from "../decorators/allow-unverified.decorator";
import { env } from "../../config/env";

/** Global guard: authenticates via the HTTP-only session cookie. */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token || typeof token !== "string") {
      throw new UnauthorizedException("Authentication required");
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException("Session expired or invalid");
    }

    // Sliding renewal: extend when past half-life.
    const ttlMs = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
    if (session.expiresAt.getTime() - Date.now() < ttlMs / 2) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { expiresAt: new Date(Date.now() + ttlMs) },
      });
    }

    // Email verification gate: unverified accounts may only reach the few
    // routes explicitly marked @AllowUnverified() (profile read, logout,
    // resend-verification). Mandatory in production (assertProductionConfig).
    if (env.REQUIRE_EMAIL_VERIFICATION && !session.user.emailVerifiedAt) {
      const allowUnverified = this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowUnverified) {
        throw new ForbiddenException(
          "Please verify your email address to continue. Check your inbox or request a new verification link.",
        );
      }
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: session.user.emailVerifiedAt != null,
    };
    return true;
  }
}
