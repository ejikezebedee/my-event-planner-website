import { expect, test } from "@playwright/test";

test("landing page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan events");
});

test("demo login reaches the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@eventplanner.dev");
  await page.getByLabel("Password").fill("Demo1234!");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/app");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("seeded event shows exact financial totals", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@eventplanner.dev");
  await page.getByLabel("Password").fill("Demo1234!");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/app");
  await page.goto("/app/events");
  await expect(page.getByText("Anna & Ben's Wedding")).toBeVisible();
  await page.getByText("Anna & Ben's Wedding").click();
  await expect(page.getByText("Finances")).toBeVisible();
  await expect(page.getByText("12.500,00").first()).toBeVisible({ timeout: 10_000 });
});

test("unauthenticated /app redirects to login", async ({ page }) => {
  await page.goto("/app");
  await page.waitForURL("**/login**");
});
