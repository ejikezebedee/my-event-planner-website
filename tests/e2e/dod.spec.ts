import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@eventplanner.dev");
  await page.getByLabel("Password").fill("Demo1234!");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/app");
}

test.describe("Definition of Done — browser steps", () => {
  test("step 31 — the PWA is installable (manifest + service worker + icons)", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    const link = page.locator('link[rel="manifest"]');
    await expect(link).toHaveCount(1);
    const href = await link.getAttribute("href");
    const manifest = await (await context.request.get(href!)).json();

    // Chromium installability criteria.
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(manifest.display);
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");

    // Icons actually serve.
    for (const icon of manifest.icons) {
      const res = await context.request.get(icon.src);
      expect(res.status()).toBe(200);
    }

    // Service worker controls the page (offline-capable shell).
    await page.waitForFunction(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg?.active;
    });
  });

  test("step 30 — archive and restore an event through the UI", async ({ page }) => {
    await login(page);
    // Seeded event has financial records → delete archives it.
    await page.goto("/app/events/1");
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("button", { name: "Restore event" })).toBeVisible({
      timeout: 10_000,
    });
    // Restore brings it back to planning.
    await page.getByRole("button", { name: "Restore event" }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible({ timeout: 10_000 });
    // Status badge no longer shows archived.
    await expect(page.getByText("archived", { exact: true })).toHaveCount(0);
  });

  test("step 1+32 — public website works on desktop and mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Plan events/i })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/features");
    await expect(page.getByRole("heading").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
