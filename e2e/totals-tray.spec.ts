import { expect, test } from "@playwright/test";
import { seedBill } from "./helpers/seed";

// TotalsTray (#21) on the E2E-only stub Split step (app/harness/totals-tray).

const person = (id: string, name: string, colorIndex: number) => ({ id, name, colorIndex });
const item = (id: string, name: string, priceCents: number) => ({ id, name, quantity: 1, priceCents, claims: {} });

async function setup(page: import("@playwright/test").Page) {
  const id = await seedBill(page, {
    people: [person("p-ana", "Ana", 0), person("p-ben", "Ben", 1)],
    items: [item("i-1", "Tacos", 1850), item("i-2", "Nachos", 1200), item("i-3", "Soda", 500)],
  });
  await page.goto(`/harness/totals-tray?bill=${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Totals tray harness" })).toBeVisible();
  return id;
}

test("collapsed bar shows unclaimed money and count; expanding lists people", async ({ page }) => {
  await setup(page);
  const tray = page.getByTestId("totals-tray");
  const toggle = tray.getByRole("button", { expanded: false });
  await expect(toggle).toContainText("$42.60 unclaimed");
  await expect(toggle).toContainText("3 items");
  await toggle.click();
  await expect(tray.getByRole("button", { expanded: true })).toBeVisible();
  await expect(tray.getByRole("button", { name: /Ana/ })).toBeVisible();
  await expect(tray.getByText("Unclaimed", { exact: true })).toBeVisible();
});

test("claiming moves value from unclaimed to the person; totals reconcile with the header", async ({ page }) => {
  await setup(page);
  const tray = page.getByTestId("totals-tray");
  await tray.getByRole("button", { expanded: false }).click();
  await tray.getByRole("button", { name: /Ana/ }).click(); // select active person
  await expect(tray.getByRole("button", { name: /Ana/ })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /Tacos/ }).click();
  await expect(tray.getByRole("button", { expanded: true })).toContainText("$20.40 unclaimed");
  await expect(tray.getByRole("button", { expanded: true })).toContainText("2 items");

  const money = (s: string) => Math.round(parseFloat(s.replace(/[^0-9.]/g, "")) * 100);
  const rows = tray.locator("li");
  const ana = money((await rows.nth(0).locator(".font-mono").last().innerText()));
  const ben = money(await rows.nth(1).locator(".font-mono").last().innerText());
  const unclaimed = money(await rows.nth(2).locator(".font-mono").last().innerText());
  const grand = Number(await page.getByTestId("grand-total").evaluate((e) => e.textContent));
  expect(ana).toBeGreaterThan(1850); // tacos + its share of tip
  expect(ana + ben + unclaimed).toBe(grand);
});

test("all claimed shows the grand total and the active person's total", async ({ page }) => {
  await setup(page);
  const tray = page.getByTestId("totals-tray");
  await tray.getByRole("button", { expanded: false }).click();
  await tray.getByRole("button", { name: /Ana/ }).click();
  for (const name of [/Tacos/, /Nachos/, /Soda/]) await page.getByRole("button", { name }).click();
  const toggle = tray.getByRole("button", { expanded: true });
  await expect(toggle).toContainText("All claimed ✓");
  await expect(toggle).toContainText("$42.60"); // $35.50 + 20% tip
  await expect(toggle).toContainText("You: $42.60");
});
