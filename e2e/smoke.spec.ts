import { expect, test } from "@playwright/test";

// BottomNav is `md:hidden` and NavRail is `hidden md:flex`; exactly one is visible per
// project, and both are labelled "Primary".
const nav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Primary" }).locator("visible=true");

test("home page shows the split-it heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "split-it" })).toBeVisible();
});

test("tab navigation between Bills and Settings", async ({ page }) => {
  await page.goto("/");
  await expect(nav(page).getByRole("link", { name: "Bills" })).toHaveAttribute("aria-current", "page");

  await nav(page).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");

  await nav(page).getByRole("link", { name: "Bills" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(nav(page).getByRole("link", { name: "Bills" })).toHaveAttribute("aria-current", "page");
});

test("nav offers a New bill control", async ({ page }) => {
  await page.goto("/");
  await expect(nav(page).getByRole("button", { name: /new bill/i })).toBeVisible();
});
