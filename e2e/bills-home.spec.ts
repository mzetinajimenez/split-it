import { expect, test } from "@playwright/test";
import { seedBill } from "./helpers/seed";

test("empty → New bill → receipt → Back shows a row → delete → empty", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Split your first bill")).toBeVisible();

  const btn = page.getByRole("main").getByRole("button", { name: "New bill" });
  await btn.dblclick();
  await expect(page).toHaveURL(/\/bills\/[^/]+\/receipt$/);

  await page.goBack();
  const rows = page.getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Untitled bill");

  await page.getByRole("button", { name: "Delete Untitled bill" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Bill deleted")).toBeVisible();
  await expect(page.getByText("Split your first bill")).toBeVisible();
});

test("50 seeded bills render as a compact list", async ({ page }) => {
  await page.goto("/");
  for (let i = 0; i < 50; i++) {
    await seedBill(page, {
      title: `Bill ${i + 1}`,
      date: `2026-${String(11 - (i % 3)).padStart(2, "0")}-${String(1 + (i % 27)).padStart(2, "0")}`,
      people: [{ id: "a", name: "Ana", colorIndex: 0 }],
      items: [{ id: "i", name: "Tacos", quantity: 1, priceCents: 1000 + i * 37, claims: i % 2 ? { a: 1 } : {} }],
    });
  }
  await page.reload();
  await expect(page.getByRole("listitem")).toHaveCount(50);
  const box = await page.getByRole("listitem").first().boundingBox();
  expect(box!.height).toBeLessThanOrEqual(52);
});
