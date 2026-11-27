import { expect, test, type Page } from "@playwright/test";
import { seedBill } from "./helpers/seed";

/*
 * Hand-computed fixture: Ana, Ben and Cy (Cy ordered nothing). Steak $100.00 (Ana) +
 * Pasta $21.50 (Ben) = $121.50. Tax $12.15 (proportional). Tip is 20% unless noted.
 *   pre-tax, proportional:  tip 2430 → Ana 2000, Ben 430.
 *     Ana 10000+1000+2000 = 13000, Ben 2150+215+430 = 2795, Cy 0. Σ 15795.
 *   post-tax, proportional: 20% × (12150+1215) = 2673 → Ana 2200, Ben 473.
 *     Ana 13200, Ben 2838, Cy 0. Σ 16038.
 *   fixed $12.15, proportional: Ana 1000, Ben 215. Ana 12000, Ben 2580, Cy 0. Σ 14580.
 *   equal, 20% pre-tax: 2430 / 3 = 810 each.
 *     Ana 11810, Ben 3175, Cy 810. Σ 15795.
 */
async function seed(page: Page) {
  return seedBill(page, {
    people: [
      { id: "ana", name: "Ana", colorIndex: 0 },
      { id: "ben", name: "Ben", colorIndex: 1 },
      { id: "cy", name: "Cy", colorIndex: 2 },
    ],
    items: [
      { id: "s", name: "Steak", quantity: 1, priceCents: 10000, claims: { ana: 1 } },
      { id: "p", name: "Pasta", quantity: 1, priceCents: 2150, claims: { ben: 1 } },
    ],
    adjustments: [{ id: "tax", kind: "tax", label: "Tax", value: { type: "amount", cents: 1215 }, split: "proportional" }],
  });
}

async function totals(page: Page, id: string): Promise<number[]> {
  await page.goto(`/bills/${id}/summary`);
  await expect(page.getByTestId("reconcile-banner")).toContainText("adds up to");
  const out: number[] = [];
  for (const name of ["Ana", "Ben", "Cy"]) {
    const text = await page.getByTestId(`person-${name}`).getByRole("button", { expanded: false }).first().innerText();
    out.push(Math.round(parseFloat(text.match(/\$([\d,]+\.\d{2})/)![1].replace(/,/g, "")) * 100));
  }
  return out;
}

const cases: { name: string; method: string; setup?: (page: Page) => Promise<void>; tip: string; expected: number[] }[] = [
  { name: "pre-tax, in proportion", method: "pretax", tip: "$24.30", expected: [13000, 2795, 0] },
  {
    name: "post-tax, in proportion",
    method: "posttax",
    tip: "$26.73",
    expected: [13200, 2838, 0],
  },
  {
    name: "fixed amount, in proportion",
    method: "fixed",
    setup: async (page) => {
      await page.getByLabel("Tip amount").fill("12.15");
      await page.getByLabel("Tip amount").press("Enter");
    },
    tip: "$12.15",
    expected: [12000, 2580, 0],
  },
  { name: "split equally", method: "equal", tip: "$24.30", expected: [11810, 3175, 810] },
];

for (const c of cases) {
  test(`tip method: ${c.name}`, async ({ page }) => {
    const id = await seed(page);
    await page.goto(`/bills/${id}/tip`);
    await page.getByLabel("Split method").selectOption(c.method);
    await c.setup?.(page);
    await expect(page.getByTestId("tip-amount")).toContainText(c.tip);
    const got = await totals(page, id);
    expect(got).toEqual(c.expected);
    expect(got.reduce((a, b) => a + b, 0)).toBe(c.expected.reduce((a, b) => a + b, 0));
  });
}

test("equal copy names the headcount", async ({ page }) => {
  const id = await seed(page);
  await page.goto(`/bills/${id}/tip`);
  await page.getByLabel("Split method").selectOption("equal");
  await expect(page.getByText("Split equally between all 3 people")).toBeVisible();
});

test("a fee can be split equally", async ({ page }) => {
  const id = await seed(page);
  await page.goto(`/bills/${id}/tip`);
  await page.getByRole("button", { name: "Add fee" }).click();
  await page.getByLabel("Label").fill("Delivery");
  await page.getByLabel("Fee", { exact: true }).fill("3");
  await page.getByRole("dialog").getByLabel("Split method").selectOption("equal");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("list").getByText("Delivery")).toBeVisible();
  // The seeded bill has no tip; the $3.00 fee splits equally: $1.00 each.
  const got = await totals(page, id);
  expect(got).toEqual([10000 + 1000 + 100, 2150 + 215 + 100, 100]);
});
