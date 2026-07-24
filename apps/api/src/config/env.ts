import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  // Comma-separated list of allowed web origins (first is canonical).
  WEB_ORIGIN: z
    .string()
    .default("http://localhost:3000")
    .refine(
      (v) => v.split(",").every((o) => z.string().url().safeParse(o.trim()).success),
      "WEB_ORIGIN must be a URL or comma-separated list of URLs",
    ),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default(""),
  TRUST_PROXY: z.string().default(""),
  SESSION_COOKIE_SECURE: z.coerce.boolean().default(false),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  EMAIL_PROVIDER: z.enum(["console", "resend", "smtp"]).default("console"),
  RESEND_API_KEY: z.string().default(""),
  SMTP_URL: z.string().default(""),
  EMAIL_FROM: z.string().default("My Event Planner <no-reply@eventplanner.local>"),
  // Where contact-form submissions are delivered.
  CONTACT_EMAIL: z.string().email().default("contact@example.com"),
  // Contact-form submissions per minute per client (spam guard).
  CONTACT_RATE_LIMIT: z.coerce.number().int().positive().default(5),
  // Unverified accounts are blocked from the app when true. Defaults on in
  // production, off in dev/test; cannot be disabled in production
  // (assertProductionConfig enforces this).
  REQUIRE_EMAIL_VERIFICATION: z.coerce.boolean().default(process.env.NODE_ENV === "production"),
  // Optional malware-scanning HTTP bridge for uploaded documents (e.g. a
  // ClamAV REST wrapper). Empty = built-in no-op scanner (marks clean).
  MALWARE_SCAN_URL: z.string().default(""),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_DIR: z.string().default("./uploads"),
  S3_ENDPOINT: z.string().default(""),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default(""),
  S3_ACCESS_KEY_ID: z.string().default(""),
  S3_SECRET_ACCESS_KEY: z.string().default(""),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  SIGNED_URL_TTL: z.coerce.number().int().positive().default(300),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(10),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  // Swagger UI at /docs — off in production unless explicitly enabled.
  SWAGGER_ENABLED: z.coerce.boolean().default(process.env.NODE_ENV !== "production"),
  // Auth endpoint rate limits (per minute, per client).
  AUTH_REGISTER_RATE_LIMIT: z.coerce.number().int().positive().default(5),
  AUTH_LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;

/**
 * Fail fast at boot when the production configuration is unsafe. Called by
 * the API (main.ts) and the worker (worker.ts) before anything listens —
 * a misconfigured production deploy must never start serving traffic.
 */
export function assertProductionConfig(): void {
  if (env.NODE_ENV !== "production") return;
  const problems: string[] = [];
  const isLocal = (v: string) => /localhost|127\.0\.0\.1|\[::1\]/.test(v);

  const allWebOrigins = env.WEB_ORIGIN.split(",").map((value) => value.trim());
  if (allWebOrigins.some(isLocal))
    problems.push("WEB_ORIGIN must use public origins, not localhost");
  if (allWebOrigins.some((value) => !value.startsWith("https://")))
    problems.push("WEB_ORIGIN must use HTTPS in production");
  if (isLocal(env.APP_BASE_URL)) problems.push("APP_BASE_URL must be a public URL, not localhost");
  if (!env.APP_BASE_URL.startsWith("https://"))
    problems.push("APP_BASE_URL must use HTTPS in production");
  if (!env.REDIS_URL) problems.push("REDIS_URL is required in production");
  if (!env.MALWARE_SCAN_URL) problems.push("MALWARE_SCAN_URL is required in production");
  if (!env.TRUST_PROXY) problems.push("TRUST_PROXY must be configured in production");
  if (!env.SESSION_COOKIE_SECURE) {
    problems.push("SESSION_COOKIE_SECURE must be true in production (sessions over HTTPS only)");
  }
  if (/example\.com$/i.test(env.CONTACT_EMAIL))
    problems.push("CONTACT_EMAIL must not use an example address");
  if (/example\.com/i.test(env.EMAIL_FROM))
    problems.push("EMAIL_FROM must not use an example address");
  if (env.EMAIL_PROVIDER === "console") {
    problems.push("EMAIL_PROVIDER=console discards real email — configure smtp or resend");
  }
  if (env.EMAIL_PROVIDER === "smtp" && !env.SMTP_URL) {
    problems.push("SMTP_URL is required when EMAIL_PROVIDER=smtp");
  }
  if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) {
    problems.push("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  }
  if (
    env.STORAGE_DRIVER === "s3" &&
    (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)
  ) {
    problems.push(
      "S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when STORAGE_DRIVER=s3",
    );
  }
  if (!env.REQUIRE_EMAIL_VERIFICATION) {
    problems.push("REQUIRE_EMAIL_VERIFICATION must not be disabled in production");
  }
  if (env.SWAGGER_ENABLED) {
    problems.push("SWAGGER_ENABLED must be false in production");
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start — unsafe production configuration:\n  - ${problems.join("\n  - ")}`,
    );
  }
}
