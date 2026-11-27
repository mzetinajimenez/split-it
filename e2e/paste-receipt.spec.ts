import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Paste-receipt import (#17), driven on the E2E-only harness route (app/harness/paste).

const RESTAURANT = readFileSync("lib/receipt/fixtures/restaurant.txt", "utf8");

async function pasteAndParse(page: Page, text: string) {
  await page.getByRole("button", { name: "Paste receipt" }).click();
  const sheet = page.getByRole("dialog", { name: "Paste receipt" });
  await expect(sheet).toBeVisible();
  await sheet.getByPlaceholder("Paste your receipt here").fill(text);
  await sheet.getByRole("button", { name: "Parse" }).click();
  const review = page.getByRole("dialog", { name: "Review items" });
  await expect(review).toBeVisible();
  return review;
}

test("paste → review → uncheck one, edit one price → Add", async ({ page }) => {
  await page.goto("/harness/paste");
  const review = await pasteAndParse(page, RESTAURANT);

  await expect(review.getByRole("button", { name: "Add 8 items" })).toBeVisible();
  await review.getByRole("checkbox", { name: "Include Sparkling Water" }).uncheck();
  await review.getByLabel("Price, row 1").fill("15.00");
  await expect(review.getByText("16 lines ignored")).toBeVisible();

  // Nothing is written before Add.
  await expect(page.getByRole("list", { name: "Items", exact: true }).getByRole("listitem")).toHaveCount(0);

  await review.getByRole("button", { name: "Add 7 items" }).click();
  await expect(review).toBeHidden();
  await expect(page).not.toHaveURL(/\?sheet=/);

  const items = page.getByRole("list", { name: "Items", exact: true }).getByRole("listitem");
  await expect(items).toHaveCount(7);
  await expect(items.first()).toContainText("Burrata");
  await expect(items.first()).toContainText("$15.00");
  await expect(page.getByText("Sparkling Water")).toHaveCount(0);
  await expect(page.getByTestId("tax")).toContainText("$15.62");
  await expect(page.getByText("Added 7 items")).toBeVisible();
});

test("Back with the sheet open just closes it and writes nothing", async ({ page }) => {
  await page.goto("/harness/paste");
  const review = await pasteAndParse(page, RESTAURANT);
  await page.goBack();
  await expect(review).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Receipt harness" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Items", exact: true }).getByRole("listitem")).toHaveCount(0);
  await expect(page.getByTestId("tax")).toContainText("none");
});

test("an existing bill asks append or replace; replace confirms first", async ({ page }) => {
  await page.goto("/harness/paste?existing=1");
  await expect(page.getByText("Old item")).toBeVisible();
  const review = await pasteAndParse(page, "Soup 4.00\nBread 2.00\nTotal 6.00");
  await review.getByLabel("Replace them").check();
  await review.getByRole("button", { name: "Add 2 items" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await expect(page.getByText("Soup")).toHaveCount(0);
  await confirm.getByRole("button", { name: "Replace" }).click();
  await expect(review).toBeHidden();
  const items = page.getByRole("list", { name: "Items", exact: true }).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(page.getByText("Old item")).toHaveCount(0);
});

test("a negative line becomes a discount, not an item", async ({ page }) => {
  await page.goto("/harness/paste");
  const review = await pasteAndParse(page, "Burger 12.00\nHappy hour -3.00");
  await expect(review.getByText("Discount", { exact: true })).toBeVisible();
  await review.getByRole("button", { name: "Add 1 item" }).click();
  await expect(review).toBeHidden();
  await expect(page.getByRole("list", { name: "Items", exact: true }).getByRole("listitem")).toHaveCount(1);
});
