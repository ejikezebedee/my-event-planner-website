import { expect, test } from "@playwright/test";

// Phase 7 — public website coverage: every public route renders with its
// core content, navigation works, and the landing page carries all sections.

const PAGES: { path: string; marker: string | RegExp }[] = [
  { path: "/features", marker: /Features/i },
  { path: "/use-cases", marker: /Use cases/i },
  { path: "/about", marker: /About My Event Planner/i },
  { path: "/faq", marker: /Frequently asked questions/i },
  { path: "/contact", marker: /Contact/i },
  { path: "/privacy", marker: /Privacy/i },
  { path: "/terms", marker: /Terms/i },
  { path: "/login", marker: /Log in/i },
  { path: "/register", marker: /Create|Register|Sign up/i },
];

test.describe("public website", () => {
  for (const { path, marker } of PAGES) {
    test(`${path} renders`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText(marker).first()).toBeVisible();
    });
  }

  test("landing page carries all required sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Plan events/i })).toBeVisible();
    await expect(page.getByText(/Everything an event needs/i)).toBeVisible(); // features
    await expect(page.getByRole("heading", { name: /Financial discipline/i })).toBeVisible(); // expense control
    await expect(page.getByText(/How it works/i)).toBeVisible(); // workflow
    await expect(page.getByText(/Built for every kind of event/i)).toBeVisible(); // use cases
    await expect(page.getByText(/Your data, your event/i)).toBeVisible(); // security
    await expect(page.getByText(/Frequently asked questions/i)).toBeVisible(); // FAQ
    await expect(page.getByText(/Start planning with confidence/i)).toBeVisible(); // final CTA
    // Product preview is a real screenshot, not a mock
    await expect(page.getByAltText(/budget view/i)).toBeVisible();
    // Footer legal links
    await expect(page.getByRole("link", { name: "Privacy" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms" }).first()).toBeVisible();
  });

  test("public navigation links work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Plan events/i })).toBeVisible();
    await page.getByRole("link", { name: "Features" }).first().click();
    await expect(page).toHaveURL(/\/features/);
    await expect(page.getByRole("heading", { name: "Features", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Get started" }).first().click();
    await expect(page).toHaveURL(/\/register/);
  });

  test("contact page exposes a working form", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
  });
});
