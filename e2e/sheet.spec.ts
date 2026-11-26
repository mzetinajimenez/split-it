import { expect, test } from "@playwright/test";

// The `?sheet=` overlay mechanism (#5), driven on the E2E-only harness route
// (app/harness/sheet). Runs in both viewport projects: below `sm` the Sheet is a bottom sheet,
// at desktop width a centred modal — the history behaviour must be identical.

const HARNESS = "/harness/sheet";

async function openSheet(page: import("@playwright/test").Page) {
  await page.goto(HARNESS);
  await expect(page.getByRole("heading", { level: 1, name: "Sheet harness" })).toBeVisible();
  await page.getByRole("button", { name: "Open sheet" }).click();
  const sheet = page.getByRole("dialog", { name: "Demo sheet" });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\?sheet=demo/);
  return sheet;
}

test("Back closes the sheet and the page stays", async ({ page }) => {
  // A marker on `window` survives a soft (client-side) close but not a full reload — the failure
  // mode of a pushState entry missing Next's `__NA` marker.
  await page.goto(HARNESS);
  await page.evaluate(() => ((window as unknown as { __alive: boolean }).__alive = true));
  await page.getByRole("button", { name: "Open sheet" }).click();
  const sheet = page.getByRole("dialog", { name: "Demo sheet" });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\?sheet=demo/);

  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/\?sheet=/);
  await expect(page).toHaveURL(new RegExp(`${HARNESS}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Sheet harness" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive)).toBe(true);
});

test("Escape closes the sheet and consumes its history entry", async ({ page }) => {
  const sheet = await openSheet(page);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/\?sheet=/);
  // The entry was popped, not left behind: Forward brings the sheet back.
  await page.goForward();
  await expect(sheet).toBeVisible();
});

test("the close button closes the sheet and returns focus to the trigger", async ({ page }) => {
  const sheet = await openSheet(page);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/\?sheet=/);
  await expect(page.getByRole("button", { name: "Open sheet" })).toBeFocused();
});

test("a cold load with ?sheet= is stripped and does not open the sheet", async ({ page }) => {
  await page.goto(`${HARNESS}?sheet=demo`);
  await expect(page).not.toHaveURL(/\?sheet=/);
  await expect(page.getByRole("dialog", { name: "Demo sheet" })).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Sheet harness" })).toBeVisible();
});

test("ConfirmBox takes focus as an alertdialog and hands it back to the sheet", async ({ page }) => {
  const sheet = await openSheet(page);
  await sheet.getByRole("button", { name: "Delete" }).click();
  const confirm = sheet.getByRole("alertdialog", { name: "Delete this thing?" });
  await expect(confirm).toBeFocused();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  // The trigger was swapped out for the box, so focus falls back to the dialog panel.
  await expect(sheet).toBeFocused();
});

test("toast announces in a polite live region", async ({ page }) => {
  await page.goto(HARNESS);
  await page.getByRole("button", { name: "Show toast" }).click();
  const region = page.locator('[aria-live="polite"]');
  await expect(region).toContainText("Couldn’t save");
  await expect(region).not.toContainText("Couldn’t save", { timeout: 6000 });
});
