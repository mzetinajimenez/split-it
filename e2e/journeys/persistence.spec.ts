import { ALL_ITEM_NAMES, dinnerBill } from "../data/dinner";
import { seedBill } from "../helpers/seed";
import { claim, expect, itemRow, test } from "../fixtures";

// Journey 5 (#27): reload mid-claim. Claims live in IndexedDB; the active person lives in
// sessionStorage. Both survive a reload, and claiming carries on from where it was.

test("reload mid-claim keeps the claims and the active person", async ({ page }) => {
  const id = await seedBill(page, dinnerBill({ unclaimed: ALL_ITEM_NAMES }));
  await page.goto(`/bills/${id}/split`);
  await expect(page.getByText(`Unclaimed (${ALL_ITEM_NAMES.length})`)).toBeVisible();

  await claim(page, "Ben", ["Burrata"]);
  await claim(page, "Cy", ["Mushroom Risotto", "Burrata"]);
  await page.reload();

  await expect(page.getByRole("radiogroup", { name: "Who are you?" }).getByRole("radio", { name: "Cy" })).toBeChecked();
  await expect(itemRow(page, "Burrata")).toHaveAccessibleName(/claimed by Ben and Cy, you have claimed this$/);
  await expect(itemRow(page, "Mushroom Risotto")).toHaveAccessibleName(/claimed by Cy, you have claimed this$/);
  await expect(page.getByText(`Unclaimed (${ALL_ITEM_NAMES.length - 2})`)).toBeVisible();

  // Still Cy: the next tap claims for them without picking again.
  await itemRow(page, "Pitcher").click();
  await expect(itemRow(page, "Pitcher")).toHaveAccessibleName(/claimed by Cy, you have claimed this$/);
});
