import { dinnerBill, EXPECTED, PEOPLE } from "../data/dinner";
import { seedBill } from "../helpers/seed";
import { expect, goToStep, itemRow, readTotals, test } from "../fixtures";

// Journey 2 (#27): partial-claim honesty. The dinner (e2e/data/dinner.ts) with the $10.00
// Chocolate Torte left unclaimed: Summary says so (and names the amount), nothing is
// auto-assigned, and "Split the rest evenly" across 3 of the 4 balances the bill.
//
// Ana isn't a claimant of the torte before or after, so her total is the same $57.04 both
// times (spec §5.5: with a payer set, a person's total depends only on their own subtotal).

test("an unclaimed item shows on Summary; splitting the rest across 3 of 4 balances", async ({ page }) => {
  const id = await seedBill(page, dinnerBill({ unclaimed: ["Chocolate Torte"] }));
  await page.goto(`/bills/${id}/summary`);

  const banner = page.getByTestId("reconcile-banner");
  await expect(banner).toContainText("$10.00 still unclaimed (1 item)");
  const before = await readTotals(page, PEOPLE);
  expect(before.Ana).toBe(EXPECTED.totals.Ana);
  const claimed = Object.values(before).reduce((a, b) => a + b, 0);
  expect(claimed).toBeLessThan(EXPECTED.grandCents); // the torte's share is in no one's total

  await banner.getByRole("link", { name: "Go to Split" }).click();
  await expect(page).toHaveURL(new RegExp(`/bills/${id}/split$`));
  await expect(itemRow(page, "Chocolate Torte")).toHaveAccessibleName(/, unclaimed$/);

  await page.getByRole("button", { name: "Split the rest evenly" }).click();
  const rest = page.getByRole("dialog", { name: "Split the rest" });
  await rest.getByRole("checkbox", { name: "Ana" }).uncheck();
  await rest.getByRole("button", { name: /Split 1 item among 3/ }).click();
  await expect(rest).toBeHidden();
  await expect(itemRow(page, "Chocolate Torte")).toHaveAccessibleName(/claimed by Ben and Cy and Dee/);

  await goToStep(page, "Summary");
  await expect(banner).toContainText("adds up to $289.81");
  const after = await readTotals(page, PEOPLE);
  expect(after.Ana).toBe(EXPECTED.totals.Ana);
  expect(Object.values(after).reduce((a, b) => a + b, 0)).toBe(EXPECTED.grandCents);
});
