import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests. Requires web (:3000) + api (:4000) running with a
 * migrated and seeded database:
 *   docker compose up -d
 *   pnpm --filter @mep/api prisma:migrate && pnpm --filter @mep/api seed
 *   pnpm dev
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.WEB_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
