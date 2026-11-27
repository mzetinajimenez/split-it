import { expect, test, type Page } from "@playwright/test";
import { seedBill } from "./helpers/seed";

// TotalsTray (#21) on the real Split step (/bills/[id]/split).

const person = (id: string, name: string, colorIndex: number) => ({ id, name, colorIndex });
const item = (id: string, name: string, priceCents: number) => ({ id, name, quantity: 1, priceCents, claims: {} });

async function openSplit(page: Page) {
  const id = await seedBill(page, {
    people: [person("p-ana", "Ana", 0), person("p-ben", "Ben", 1)],
    items: [item("i-1", "Tacos", 1850), item("i-2", "Nachos", 1200), item("i-3", "Soda", 500)],
  });
  await page.goto(`/bills/${id}/split`);
  await expect(page.getByRole("radiogroup", { name: "Who are you?" })).toBeVisible();
}

const row = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name},`) });
const money = (s: string) => Math.round(parseFloat(s.replace(/[^0-9.]/g, "")) * 100);

test("collapsed bar shows unclaimed money and count; expanding lists people", async ({ page }) => {
  await openSplit(page);
  const tray = page.getByTestId("totals-tray");
  const toggle = tray.getByRole("button", { expanded: false });
  await expect(toggle).toContainText("$42.60 unclaimed");
  await expect(toggle).toContainText("3 items");
  await toggle.click();
  await expect(tray.getByRole("button", { expanded: true })).toBeVisible();
  await expect(tray.getByRole("button", { name: /Ana/ })).toBeVisible();
  await expect(tray.getByText("Unclaimed", { exact: true })).toBeVisible();
});

test("claiming moves value from unclaimed to the person; totals reconcile", async ({ page }) => {
  await openSplit(page);
  const tray = page.getByTestId("totals-tray");
  await tray.getByRole("button", { expanded: false }).click();
  await tray.getByRole("button", { name: /Ana/ }).click(); // tray selects the active person
  await expect(tray.getByRole("button", { name: /Ana/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("radio", { name: "Ana" })).toBeChecked();

  await row(page, "Tacos").click();
  const toggle = tray.getByRole("button", { expanded: true });
  await expect(toggle).toContainText("$20.40 unclaimed");
  await expect(toggle).toContainText("2 items");

  const rows = tray.locator("li");
  const ana = money(await rows.nth(0).locator(".font-mono").last().innerText());
  const ben = money(await rows.nth(1).locator(".font-mono").last().innerText());
  const unclaimed = money(await rows.nth(2).locator(".font-mono").last().innerText());
  expect(ana).toBeGreaterThan(1850); // tacos + its share of tip
  expect(ana + ben + unclaimed).toBe(4260); // $35.50 + 20% tip: the grand total
});

test("all claimed shows the grand total and the active person's total", async ({ page }) => {
  await openSplit(page);
  const tray = page.getByTestId("totals-tray");
  await page.getByRole("radio", { name: "Ana" }).click();
  for (const name of ["Tacos", "Nachos", "Soda"]) {
    await row(page, name).click();
    await page.waitForTimeout(300); // the board's double-tap debounce
  }
  const toggle = tray.getByRole("button").first();
  await expect(toggle).toContainText("All claimed ✓");
  await expect(toggle).toContainText("$42.60");
  await expect(toggle).toContainText("You: $42.60");
});
