import { expect, test } from "@playwright/test";

test("home page shows the split-it heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "split-it" })).toBeVisible();
});
