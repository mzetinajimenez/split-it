import { expect, test } from "@playwright/test";
import { seedBill } from "./helpers/seed";

/*
 * Hand-computed fixture: Ana, Ben, Cy, Sam; Sam paid. Tax is 888 bps (the nearest whole
 * basis point to 8.875%), tip 20% pre-tax, both proportional.
 *   Nachos  $20.00  Ana 1 / Ben 1 (a 2-way split)  → $10.00 each
 *   Pitcher $30.00  Cy 2 : Sam 1 (weighted)         → Cy $20.00, Sam $10.00
 *   Burger  $10.00  Sam                             → Sam $10.00
 *   Items $60.00; tax round(6000 × 8.88%) = $5.33; tip 20% × 6000 = $12.00; grand $77.33
 *   Ana  = 10.00 + 0.89 (tax 88.8) + 2.00 (tip) = $12.89;  Ben the same
 *   Cy   = 20.00 + 1.78 + 4.00 = $25.78
 *   Sam  = the payer absorbs rounding: 77.33 − 12.89 − 12.89 − 25.78 = $25.77
 */
test("per-person totals match hand-computed values and sum to the grand total", async ({ page }) => {
  const id = await seedBill(page, {
    title: "Dinner",
    people: [
      { id: "ana", name: "Ana", colorIndex: 0 },
      { id: "ben", name: "Ben", colorIndex: 1 },
      { id: "cy", name: "Cy", colorIndex: 2 },
      { id: "sam", name: "Sam", colorIndex: 3 },
    ],
    items: [
      { id: "n", name: "Nachos", quantity: 1, priceCents: 2000, claims: { ana: 1, ben: 1 } },
      { id: "p", name: "Pitcher", quantity: 1, priceCents: 3000, claims: { cy: 2, sam: 1 } },
      { id: "b", name: "Burger", quantity: 1, priceCents: 1000, claims: { sam: 1 } },
    ],
    adjustments: [
      { id: "tax", kind: "tax", label: "Tax", value: { type: "percent", bps: 888 }, split: "proportional" },
      { id: "tip", kind: "tip", label: "Tip", value: { type: "percent", bps: 2000 }, basis: "pretax", split: "proportional" },
    ],
    paidBy: "sam",
  });
  await page.goto(`/bills/${id}/summary`);
  await expect(page.getByTestId("reconcile-banner")).toContainText("adds up to");

  const money = async (name: string) =>
    (await page.getByTestId(`person-${name}`).getByRole("button", { expanded: false }).first().innerText())
      .match(/\$[\d,]+\.\d{2}/)![0];

  const totals = await Promise.all(["Ana", "Ben", "Cy", "Sam"].map(money));
  const cents = totals.map((t) => Math.round(parseFloat(t.slice(1).replace(/,/g, "")) * 100));
  expect(totals).toEqual(["$12.89", "$12.89", "$25.78", "$25.77"]);
  expect(cents.reduce((x, y) => x + y, 0)).toBe(7733);
});

test("Mark paid persists after a reload", async ({ page }) => {
  const id = await seedBill(page, {
    people: [
      { id: "ana", name: "Ana", colorIndex: 0 },
      { id: "sam", name: "Sam", colorIndex: 1 },
    ],
    items: [{ id: "n", name: "Nachos", quantity: 1, priceCents: 2000, claims: { ana: 1, sam: 1 } }],
    paidBy: "sam",
  });
  await page.goto(`/bills/${id}/summary`);
  await page.getByTestId("person-Ana").getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByTestId("person-Ana")).toContainText("settled");
  await page.reload();
  await expect(page.getByTestId("person-Ana")).toContainText("settled");
});
