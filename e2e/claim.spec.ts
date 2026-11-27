import { expect, test, type Page } from "@playwright/test";
import { seedBill } from "./helpers/seed";

const people = ["Alex", "Sam", "Jo", "Kim"].map((name, i) => ({ id: `p-${name.toLowerCase()}`, name, colorIndex: i }));
const item = (id: string, name: string, priceCents: number) => ({ id, name, quantity: 1, priceCents, claims: {} });

async function openBoard(page: Page) {
  const id = await seedBill(page, {
    title: "Dinner",
    people,
    items: [
      item("i1", "Nachos", 1250),
      item("i2", "Burger", 1500),
      item("i3", "Salad", 900),
      item("i4", "Fries", 600),
      item("i5", "Soda", 300),
      item("i6", "Pie", 700),
    ],
  });
  await page.goto(`/bills/${id}/split`);
  await expect(page.getByRole("radiogroup", { name: "Who are you?" })).toBeVisible();
}

const row = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name},`) });
const who = (page: Page, name: string) => page.getByRole("radio", { name });

test("claim board: tap to claim, shared 2-of-4, filters, split the rest", async ({ page }) => {
  await openBoard(page);
  await expect(page.getByText("Unclaimed (6)")).toBeVisible();

  // Alex claims Nachos and Burger.
  await who(page, "Alex").click();
  await row(page, "Nachos").click();
  await expect(row(page, "Nachos")).toHaveAccessibleName("Nachos, $12.50, claimed by Alex, you have claimed this");
  await row(page, "Burger").click();

  // Sam also takes Nachos → 2 of 4, ½ each.
  await who(page, "Sam").click();
  await row(page, "Nachos").click();
  await expect(row(page, "Nachos")).toHaveAccessibleName("Nachos, $12.50, claimed by Alex and Sam, you have claimed this");
  await expect(page.getByText("2 of 4 · ½ each")).toBeVisible();
  await row(page, "Salad").click();
  await expect(page.getByText("Unclaimed (3)")).toBeVisible();

  // Tapping again (after the double-tap debounce window) un-claims.
  await page.waitForTimeout(300);
  await row(page, "Salad").click();
  await expect(page.getByText("Unclaimed (4)")).toBeVisible();

  // Unclaimed filter shows only the remaining items.
  await page.getByRole("button", { name: /^Unclaimed/ }).click();
  await expect(row(page, "Fries")).toBeVisible();
  await expect(row(page, "Salad")).toBeVisible();
  await expect(row(page, "Soda")).toBeVisible();
  await expect(row(page, "Pie")).toBeVisible();
  await expect(row(page, "Nachos")).toHaveCount(0);
  await expect(row(page, "Burger")).toHaveCount(0);

  // Mine shows Sam's items only.
  await page.getByRole("button", { name: "Mine" }).click();
  await expect(row(page, "Nachos")).toBeVisible();
  await expect(row(page, "Fries")).toHaveCount(0);
  await page.getByRole("button", { name: "All" }).click();

  // Split the rest evenly across 3 of the 4 people.
  await page.getByRole("button", { name: "Split the rest evenly" }).click();
  const dialog = page.getByRole("dialog", { name: "Split the rest" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Kim" }).uncheck();
  await dialog.getByRole("button", { name: /Split 4 items among 3/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Unclaimed (0)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Split the rest evenly" })).toHaveCount(0);
  await expect(row(page, "Pie")).toHaveAccessibleName(/claimed by Alex and Sam and Jo/);
});

test("a fast double tap does not toggle twice", async ({ page }) => {
  await openBoard(page);
  await who(page, "Jo").click();
  await row(page, "Soda").dblclick();
  await expect(row(page, "Soda")).toHaveAccessibleName(/claimed by Jo/);
});

test("active person survives a reload within the session", async ({ page }) => {
  await openBoard(page);
  await who(page, "Kim").click();
  await page.reload();
  await expect(who(page, "Kim")).toBeChecked();
});

test("no people: empty state links to People", async ({ page }) => {
  const id = await seedBill(page, { items: [item("i1", "Nachos", 1250)] });
  await page.goto(`/bills/${id}/split`);
  await expect(page.getByRole("link", { name: "Go to People" })).toHaveAttribute("href", `/bills/${id}/people`);
});
