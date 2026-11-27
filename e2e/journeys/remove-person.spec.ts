import { dinnerBill, EXPECTED, PEOPLE } from "../data/dinner";
import { seedBill } from "../helpers/seed";
import { expect, goToStep, itemRow, readTotals, test } from "../fixtures";

// Journey 6 (#27): remove a person mid-split. Ana's three items (hers alone) become
// unclaimed; Ben, Cy and Dee keep exactly the totals they had (spec §5.5: with a payer set,
// the unclaimed pseudo-participant takes Ana's weight and her rounded shares; the derivation
// is in e2e/data/dinner.ts).

test("removing a person leaves their items unclaimed and nobody else's total moves", async ({ page }) => {
  const id = await seedBill(page, dinnerBill());
  await page.goto(`/bills/${id}/summary`);
  await expect(page.getByTestId("reconcile-banner")).toContainText("adds up to $289.81");
  expect(await readTotals(page, PEOPLE)).toEqual(EXPECTED.totals);

  await goToStep(page, "People");
  await page.getByTestId("person-row-Ana").click();
  await page.getByRole("button", { name: "Remove Ana" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Ana’s claims on 3 items will be removed (3 become unclaimed)");
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("person-row-Ana")).toHaveCount(0);

  await goToStep(page, "Split");
  for (const name of ["Caesar Salad", "Glass House Red", "Beer (1/3)"]) {
    await expect(itemRow(page, name)).toHaveAccessibleName(/, unclaimed$/);
  }

  await goToStep(page, "Summary");
  await expect(page.getByTestId("reconcile-banner")).toContainText("$43.50 still unclaimed (3 items)");
  await expect(page.getByTestId("person-Ana")).toHaveCount(0);
  const { Ben, Cy, Dee } = EXPECTED.totals;
  expect(await readTotals(page, ["Ben", "Cy", "Dee"])).toEqual({ Ben, Cy, Dee });
});
