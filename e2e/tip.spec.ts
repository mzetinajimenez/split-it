import { expect, test } from "@playwright/test";
import { seedBill } from "./helpers/seed";

/*
 * Hand-computed fixture: Ana and Ben, no tax. Items $100.00 + $21.50 = $121.50.
 *   Ana: Steak $100.00 → Ben: Pasta $21.50.
 *   Default 20% pre-tax tip: 20% × 12150 = $24.30.
 *   Switch to 18%: 18% × 12150 = 2187 → $21.87.
 *   + $5.00 delivery fee, + 10% discount (−$12.15).
 *   Grand = 12150 + 2187 + 500 − 1215 = $136.22.
 *   Ana owes 136.22 × 100/121.5 and Ben the rest; they must reconcile with the grand total.
 */
test("default 20% tip, switch to 18%, add a fee and a discount; totals reconcile", async ({ page }) => {
  const id = await seedBill(page, {
    people: [
      { id: "ana", name: "Ana", colorIndex: 0 },
      { id: "ben", name: "Ben", colorIndex: 1 },
    ],
    items: [
      { id: "s", name: "Steak", quantity: 1, priceCents: 10000, claims: { ana: 1 } },
      { id: "p", name: "Pasta", quantity: 1, priceCents: 2150, claims: { ben: 1 } },
    ],
  });
  await page.goto(`/bills/${id}/tip`);

  await expect(page.getByRole("button", { name: "20%" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("tip-amount")).toContainText("$24.30");

  await page.getByRole("button", { name: "18%" }).click();
  await expect(page.getByTestId("tip-amount")).toContainText("$21.87");

  await page.getByRole("button", { name: "Add fee" }).click();
  await page.getByLabel("Label").fill("Delivery");
  await page.getByLabel("Fee", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("list").getByText("Delivery")).toBeVisible();

  await page.getByRole("button", { name: "Add discount" }).click();
  await page.getByLabel("Label").fill("Happy hour");
  await page.getByRole("radio", { name: "%" }).click();
  await page.getByLabel("Discount", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("list").getByText("Happy hour")).toBeVisible();

  await page.goto(`/bills/${id}/summary`);
  await expect(page.getByTestId("reconcile-banner")).toContainText("adds up to");
  const money = async (name: string) =>
    (await page.getByTestId(`person-${name}`).getByRole("button", { expanded: false }).first().innerText())
      .match(/\$[\d,]+\.\d{2}/)![0];
  const cents = (await Promise.all(["Ana", "Ben"].map(money))).map((t) =>
    Math.round(parseFloat(t.slice(1).replace(/,/g, "")) * 100),
  );
  expect(cents[0] + cents[1]).toBe(13622);
});

test("custom tip percent is saved", async ({ page }) => {
  const id = await seedBill(page, {
    people: [{ id: "ana", name: "Ana", colorIndex: 0 }],
    items: [{ id: "s", name: "Steak", quantity: 1, priceCents: 10000, claims: { ana: 1 } }],
  });
  await page.goto(`/bills/${id}/tip`);
  await page.getByRole("button", { name: "Custom %" }).click();
  await page.getByLabel("Custom tip %").fill("12.5");
  await page.getByLabel("Custom tip %").press("Enter");
  await expect(page.getByTestId("tip-amount")).toContainText("$12.50");
});
