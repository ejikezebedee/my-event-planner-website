import { test } from "@playwright/test";

const OUT = "docs/screenshots";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@eventplanner.dev");
  await page.getByLabel("Password").fill("Demo1234!");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/app");
}

test("capture screenshots", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({ path: `${OUT}/01-landing.png`, fullPage: true });
  await page.goto("/login");
  await page.screenshot({ path: `${OUT}/02-login.png` });
  await login(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/03-dashboard.png`, fullPage: true });
  await page.goto("/app/events/1");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/04-event-overview.png`, fullPage: true });
  for (const [slug, name] of [
    ["budget", "05"],
    ["expenses", "06"],
    ["payments", "07"],
    ["guests", "08"],
    ["tasks", "09"],
    ["reports", "10"],
  ] as const) {
    await page.goto(`/app/events/1/${slug}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${name}-${slug}.png`, fullPage: true });
  }
  await page.goto("/app/settings");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/11-settings.png`, fullPage: true });
});

test("capture mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/12-mobile-dashboard.png`, fullPage: true });
  await page.goto("/app/events/1/expenses");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/13-mobile-expenses.png`, fullPage: true });
});
