import { expect, test, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@eventplanner.dev");
  await page.getByLabel("Password").fill("Demo1234!");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/app");
}

async function expectNoHorizontalOverflow(page: Page, path: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
}

test.describe("responsive: no horizontal overflow at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("public pages fit mobile width", async ({ page }) => {
    for (const path of ["/", "/features", "/use-cases", "/faq", "/login"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalOverflow(page, path);
    }
  });

  test("app pages fit mobile width and drawer navigates", async ({ page }) => {
    await login(page);
    for (const path of [
      "/app",
      "/app/events/1/budget",
      "/app/events/1/expenses",
      "/app/events/1/guests",
      "/app/events/1/tasks",
      "/app/calendar",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalOverflow(page, path);
    }
    // Mobile navigation: hamburger opens the drawer, links navigate.
    const trigger = page.getByRole("button", { name: "Open menu" });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const calendarLink = page.getByRole("link", { name: "Calendar" }).first();
    await expect(calendarLink).toBeVisible();
    await calendarLink.click();
    await page.waitForURL("**/calendar**");
  });
});

test.describe("accessibility: axe scans", () => {
  test("public pages have no critical a11y violations", async ({ page }) => {
    for (const path of ["/", "/login", "/features"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).analyze();
      const critical = results.violations.filter((v) => v.impact === "critical");
      expect(critical.map((v) => `${path}:${v.id}`)).toEqual([]);
    }
  });

  test("authenticated pages have no critical a11y violations", async ({ page }) => {
    await login(page);
    for (const path of ["/app", "/app/events/1", "/app/events/1/expenses"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).analyze();
      const critical = results.violations.filter((v) => v.impact === "critical");
      expect(critical.map((v) => `${path}:${v.id}`)).toEqual([]);
    }
  });
});

test.describe("failure states", () => {
  test("unknown routes render the custom 404 page", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();
  });

  test("unknown event shows a failure state, not a crash", async ({ page }) => {
    await login(page);
    await page.goto("/app/events/999999");
    // Either the app 404 page or an inline error — never a blank screen.
    await expect(page.getByText(/not found|went wrong|failed/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
