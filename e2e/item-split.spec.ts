import { expect, test, type Page } from "@playwright/test";
import { seedBill } from "./helpers/seed";

// ItemSplitSheet (#20), driven on the E2E-only stand-in for the claim board
// (app/harness/item-split/[id]). Both viewport projects: bottom sheet and centred modal.

const NAMES = ["Ana", "Ben", "Cy", "Dee", "Eli"];

async function setup(page: Page, opts: { paidBy?: number | null } = {}) {
  const people = NAMES.map((name, i) => ({ id: crypto.randomUUID(), name, colorIndex: i }));
  const id = await seedBill(page, {
    people,
    paidBy: opts.paidBy == null ? null : people[opts.paidBy].id,
    items: [
      { id: crypto.randomUUID(), name: "Pizza", quantity: 1, priceCents: 1000, claims: {} },
      { id: crypto.randomUUID(), name: "Beer", quantity: 3, priceCents: 900, claims: { [people[0].id]: 1 } },
    ],
  });
  await page.goto(`/harness/item-split/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Item split harness" })).toBeVisible();
  return id;
}

async function openSheet(page: Page, item: string) {
  await page.getByRole("button", { name: `Split ${item}` }).click();
  const sheet = page.getByRole("dialog", { name: item });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\?sheet=split-item$/);
  return sheet;
}

/** Cents rendered in every person's row, in people order, read from the DOM text. */
async function previewCents(page: Page): Promise<number[]> {
  const rows = page.getByRole("dialog").locator("li[data-person]");
  const texts = await rows.evaluateAll((els) =>
    els.map((el) => {
      const money = [...el.querySelectorAll("span")].filter((s) => /^\$[\d,]+\.\d\d$/.test(s.textContent ?? "")).pop();
      return money?.textContent ?? "";
    }),
  );
  return texts.map((t) => Math.round(parseFloat(t.replace(/[$,]/g, "")) * 100));
}

const row = (page: Page, name: string) => page.getByRole("dialog").locator(`li[data-person="${name}"]`);

test("2:1 weighted shares on $10.00 shows $6.67 / $3.33 and sums to the price", async ({ page }) => {
  await setup(page);
  const sheet = await openSheet(page, "Pizza");
  await sheet.getByRole("switch", { name: "Ana", exact: true }).click();
  await sheet.getByRole("switch", { name: "Ben", exact: true }).click();
  await sheet.getByRole("button", { name: "Increase Ana’s shares" }).click();
  await expect(row(page, "Ana")).toContainText("$6.67");
  await expect(row(page, "Ben")).toContainText("$3.33");
  const cents = await previewCents(page);
  expect(cents).toEqual([667, 333, 0, 0, 0]);
  expect(cents.reduce((a, b) => a + b, 0)).toBe(1000);
});

test("3 of 5 people on $10.00 shows $3.34 / $3.33 / $3.33 and $0 for the rest", async ({ page }) => {
  await setup(page);
  const sheet = await openSheet(page, "Pizza");
  for (const n of ["Ana", "Ben", "Cy"]) await sheet.getByRole("switch", { name: n, exact: true }).click();
  const cents = await previewCents(page);
  expect(cents).toEqual([334, 333, 333, 0, 0]);
  expect(cents.reduce((a, b) => a + b, 0)).toBe(1000);
});

test("the payer absorbs the rounding, as in the engine", async ({ page }) => {
  await setup(page, { paidBy: 2 }); // Cy
  const sheet = await openSheet(page, "Pizza");
  for (const n of ["Ana", "Ben", "Cy"]) await sheet.getByRole("switch", { name: n, exact: true }).click();
  const cents = await previewCents(page);
  expect(cents).toEqual([333, 333, 334, 0, 0]);
});

test("Everyone toggles all on and off; Split evenly resets shares to 1", async ({ page }) => {
  await setup(page);
  const sheet = await openSheet(page, "Pizza");
  const everyone = sheet.getByRole("switch", { name: "Everyone", exact: true });
  await everyone.click();
  await expect(everyone).toHaveAttribute("aria-checked", "true");
  expect(await previewCents(page)).toEqual([200, 200, 200, 200, 200]);
  await sheet.getByRole("button", { name: "Increase Ana’s shares" }).click();
  await sheet.getByRole("button", { name: "Split evenly" }).click();
  expect(await previewCents(page)).toEqual([200, 200, 200, 200, 200]);
  await everyone.click();
  await expect(everyone).toHaveAttribute("aria-checked", "false");
  expect(await previewCents(page)).toEqual([0, 0, 0, 0, 0]);
});

test("switches are named and steppers announce their value", async ({ page }) => {
  await setup(page);
  const sheet = await openSheet(page, "Pizza");
  const ana = sheet.getByRole("switch", { name: "Ana", exact: true });
  await expect(ana).toHaveAttribute("aria-checked", "false");
  await expect(sheet.getByRole("group", { name: "Ana’s shares" })).toHaveCount(0);
  await ana.click();
  const stepper = sheet.getByRole("group", { name: "Ana’s shares" });
  await expect(stepper.locator("output")).toHaveText("1");
  await stepper.getByRole("button", { name: "Increase Ana’s shares" }).click();
  await expect(stepper.locator("output")).toHaveText("2");
  await expect(stepper.locator("output")).toHaveAttribute("aria-live", "polite");
});

test("Done writes once and the item id never appears in the URL", async ({ page }) => {
  await setup(page);
  const sheet = await openSheet(page, "Pizza");
  // Only the bill id (in the path) is on the URL; the query is exactly the sheet name.
  expect(new URL(page.url()).search).toBe("?sheet=split-item");
  await sheet.getByRole("switch", { name: "Ben", exact: true }).click();
  await sheet.getByRole("button", { name: "Increase Ben’s shares" }).click();
  await expect(page.getByTestId("claims-Pizza")).toHaveText("{}"); // local until Done
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/\?sheet=/);
  await expect(page.getByTestId("claims-Pizza")).toHaveText('{"Ben":2}');
});

test("Back closes without writing", async ({ page }) => {
  await setup(page);
  const sheet = await openSheet(page, "Pizza");
  await sheet.getByRole("switch", { name: "Ben", exact: true }).click();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("claims-Pizza")).toHaveText("{}");
});

test("Clear then Done empties the claims", async ({ page }) => {
  await setup(page);
  const sheet = await openSheet(page, "Beer");
  await expect(row(page, "Ana")).toContainText("$9.00");
  await sheet.getByRole("button", { name: "Clear" }).click();
  await expect(sheet.getByText("It stays unclaimed")).toBeVisible();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("claims-Beer")).toHaveText("{}");
});

test("Split into units confirms, explodes the item and closes", async ({ page }) => {
  await setup(page);
  await expect(page.getByRole("button", { name: "Split Pizza" })).toBeVisible();
  await openSheet(page, "Pizza").then(async (s) => {
    await expect(s.getByRole("button", { name: "Split into units" })).toHaveCount(0); // qty 1
    await s.getByRole("button", { name: "Close" }).click();
  });
  const sheet = await openSheet(page, "Beer");
  await sheet.getByRole("button", { name: "Split into units" }).click();
  const confirm = sheet.getByRole("alertdialog");
  await expect(confirm).toContainText("Turn 3 × Beer into 3 separate items? Current claims will be cleared.");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Split into units" }).click();
  await sheet.getByRole("alertdialog").getByRole("button", { name: "Split into units" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: "Split Beer (1/3)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Split Beer (3/3)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Split Beer", exact: true })).toHaveCount(0);
});
