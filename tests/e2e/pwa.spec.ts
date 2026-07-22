import { expect, test } from "@playwright/test";

test("PWA manifest is linked and served", async ({ page }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest.name).toBe("My Event Planner");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
});

test("service worker registers and serves the offline page", async ({ page, context }) => {
  await page.goto("/");
  // Wait until the SW is registered and activated
  await page.waitForFunction(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.active?.state === "activated";
  }, undefined, { timeout: 15_000 });

  // Reload so the activated SW controls this client before we go offline.
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 15_000 });

  // Go offline: navigation falls back to the offline page (never a cached
  // /app page — authenticated pages are not cached, see sw.js).
  await context.setOffline(true);
  await page.goto("/app").catch(() => undefined);
  await expect(page.getByText("You're offline")).toBeVisible();
  await context.setOffline(false);
});

test("offline page is directly reachable", async ({ page }) => {
  const res = await page.goto("/offline.html");
  expect(res?.status()).toBe(200);
  await expect(page.getByText("You're offline")).toBeVisible();
});
