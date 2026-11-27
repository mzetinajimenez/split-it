import { readFileSync } from "node:fs";
import {
  EXPECTED,
  EXTRA_ITEMS,
  FEE,
  PAYER,
  PEOPLE,
  PITCHER_SHARES,
  PRINTED_SUBTOTAL,
  PRINTED_TOTAL,
  TAP_CLAIMS,
  TAX_AMOUNT,
} from "../data/dinner";
import { addItems, addPeople, claim, expect, goToStep, newBill, readTotals, test } from "../fixtures";

// Journey 1 (#27): the whole product, the way a table uses it, from an empty install to a
// Summary that matches e2e/data/dinner.ts to the cent. MVP tip method only (20% pre-tax).

const RESTAURANT = readFileSync("lib/receipt/fixtures/restaurant.txt", "utf8");

test("dinner for four: paste → people → claim → tip → every total matches by hand", async ({ page }) => {
  await newBill(page);

  // Receipt: paste the restaurant fixture, review, add all 8.
  await page.getByRole("button", { name: "Paste receipt" }).click();
  const paste = page.getByRole("dialog", { name: "Paste receipt" });
  await paste.getByPlaceholder("Paste your receipt here").fill(RESTAURANT);
  await paste.getByRole("button", { name: "Parse" }).click();
  const review = page.getByRole("dialog", { name: "Review items" });
  await review.getByRole("button", { name: "Add 8 items" }).click();
  await expect(review).toBeHidden();
  await expect(page.getByLabel("Tax", { exact: true })).toHaveValue("15.62"); // the receipt's tax, pre-filled

  // Two more lines by keyboard: the pitcher and 3 × Beer.
  await addItems(page, EXTRA_ITEMS);
  const items = page.getByRole("list", { name: "Items", exact: true }).getByRole("listitem");
  await expect(items).toHaveCount(10);

  // 8.875% of the full $221.00, and the printed totals for the whole bill, typed back to back.
  const tax = page.getByLabel("Tax", { exact: true });
  await tax.fill(TAX_AMOUNT);
  await tax.press("Enter");
  const subtotal = page.getByLabel("Printed subtotal");
  await subtotal.fill(PRINTED_SUBTOTAL);
  await subtotal.press("Enter");
  const total = page.getByLabel("Printed total (before tip)");
  await total.fill(PRINTED_TOTAL);
  await total.press("Enter");
  // Before the $5 fee, items + tax are $5.00 under the printed total: proof it was saved.
  await expect(page.getByTestId("printed-mismatch-total")).toContainText("off by −$5.00");

  // People: four, and Dee paid.
  await goToStep(page, "People");
  await addPeople(page, PEOPLE);
  const payer = page.getByRole("group", { name: "Who paid?" }).getByRole("radio", { name: PAYER });
  await payer.click(); // a controlled radio: it turns checked once the write lands
  await expect(payer).toBeChecked();

  // Split: explode 3 × Beer into units first, so each unit can be tap-claimed.
  await goToStep(page, "Split");
  await page.getByRole("button", { name: "Split Beer between people" }).click();
  const beer = page.getByRole("dialog", { name: "Beer" });
  await beer.getByRole("button", { name: "Split into units" }).click();
  await beer.getByRole("alertdialog").getByRole("button", { name: "Split into units" }).click();
  await expect(beer).toBeHidden();

  for (const person of PEOPLE) await claim(page, person, TAP_CLAIMS[person]);
  await expect(page.getByText("2 of 4 · ½ each").first()).toBeVisible(); // Burrata, Steak Frites

  // The weighted pitcher, Cy 2 : Dee 1, through the chevron (the accessible path).
  await page.getByRole("button", { name: "Split Pitcher between people" }).click();
  const pitcher = page.getByRole("dialog", { name: "Pitcher" });
  for (const [name, shares] of Object.entries(PITCHER_SHARES)) {
    await pitcher.getByRole("switch", { name, exact: true }).click();
    for (let s = 1; s < shares; s++) await pitcher.getByRole("button", { name: `Increase ${name}’s shares` }).click();
  }
  await expect(pitcher.locator('li[data-person="Cy"]')).toContainText("$16.00");
  await expect(pitcher.locator('li[data-person="Dee"]')).toContainText("$8.00");
  await pitcher.getByRole("button", { name: "Done" }).click();
  await expect(pitcher).toBeHidden();
  await expect(page.getByText("Unclaimed (0)")).toBeVisible();

  // Tip: the default 20% pre-tax, plus a $5 delivery fee.
  await goToStep(page, "Tip");
  await expect(page.getByRole("button", { name: "20%" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("tip-amount")).toContainText("$44.20");
  await page.getByRole("button", { name: "Add fee" }).click();
  const fee = page.getByRole("dialog", { name: "Add fee" });
  await fee.getByLabel("Label").fill(FEE.label);
  await fee.getByLabel("Fee", { exact: true }).fill(FEE.amount);
  await fee.getByRole("button", { name: "Save" }).click();
  await expect(fee).toBeHidden();

  // Summary: balanced, no printed mismatch, every person to the cent, Σ = grand total.
  await goToStep(page, "Summary");
  const banner = page.getByTestId("reconcile-banner");
  await expect(banner).toContainText("adds up to $289.81");
  await expect(banner.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("payer-line")).toContainText(`${PAYER} paid`);
  const totals = await readTotals(page, PEOPLE);
  expect(totals).toEqual(EXPECTED.totals);
  expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBe(EXPECTED.grandCents);
});
