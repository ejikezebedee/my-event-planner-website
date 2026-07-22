import { SetMetadata } from "@nestjs/common";

export const ALLOW_UNVERIFIED_KEY = "allowUnverified";

/**
 * Marks an authenticated route as reachable for accounts whose email address
 * is not yet verified. Everything else is blocked by the session guard when
 * REQUIRE_EMAIL_VERIFICATION is on (always the case in production). Only
 * identity essentials are exempt: reading your own profile, logging out, and
 * requesting a new verification email.
 */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);
