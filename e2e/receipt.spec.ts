import { expect, test } from "@playwright/test";
import { seedBill } from "./helpers/seed";

// Receipt step (#16): keyboard-only entry, edit, delete, tax, printed-total mismatch.

test("type a receipt by keyboard, edit, delete, set tax, reconcile printed subtotal", async ({ page }) => {
  const id = await seedBill(page, { title: "Dinner" });
  await page.goto(`/bills/${id}/receipt`);
  const name = page.getByLabel("Item name");
  const items = page.getByRole("list", { name: "Items", exact: true }).getByRole("listitem");

  await name.click();
  const lines: [string, string][] = [
    ["Burger", "12.50"],
    ["Fries", "4.00"],
    ["Beer", "7.00"],
    ["Salad", "9.50"],
    ["Soda", "3.50"],
  ];
  for (const [n, p] of lines) {
    await page.keyboard.type(n);
    await page.keyboard.press("Enter"); // name → price
    await page.keyboard.type(p);
    await page.keyboard.press("Enter"); // add, focus back to name
    await expect(name).toBeFocused();
  }
  await expect(items).toHaveCount(5);
  await expect(items.first()).toContainText("Burger");
  await expect(items.first()).toContainText("$12.50");

  // Invalid price: inline error, nothing written.
  await page.keyboard.type("Bad");
  await page.keyboard.press("Enter");
  await page.keyboard.type("abc");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("form", { name: "Add item" }).getByRole("alert")).toContainText("valid price");
  await expect(items).toHaveCount(5);
  await page.getByLabel("Item name").fill("");
  await page.getByLabel("Price").fill("");

  // Edit one.
  await items.nth(1).getByRole("button").click();
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  await sheet.getByLabel("Line price").fill("5.00");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(items.nth(1)).toContainText("$5.00");

  // Delete one (unclaimed → no confirm).
  await items.nth(4).getByRole("button").click();
  await page.getByRole("dialog", { name: "Edit item" }).getByRole("button", { name: "Delete item" }).click();
  await expect(items).toHaveCount(4);

  // Tax 8.88%.
  await page.getByRole("radio", { name: "%" }).click();
  await page.getByLabel("Tax", { exact: true }).fill("8.88");
  await page.getByLabel("Tax", { exact: true }).press("Enter");

  // Items = 12.50 + 5.00 + 7.00 + 9.50 = 34.00. Printed subtotal 35.00 mismatches.
  const sub = page.getByLabel("Printed subtotal");
  await sub.fill("35.00");
  await sub.press("Enter");
  const banner = page.getByTestId("printed-mismatch-subtotal");
  await expect(banner).toContainText("Items add up to $34.00");
  await expect(banner).toContainText("receipt says $35.00");

  // Fix the item (Fries 5.00 → 6.00) and the banner clears.
  await items.nth(1).getByRole("button").click();
  const edit = page.getByRole("dialog", { name: "Edit item" });
  await edit.getByLabel("Line price").fill("6.00");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(banner).toBeHidden();

  // Persisted across reload.
  await page.reload();
  await expect(page.getByLabel("Tax", { exact: true })).toHaveValue("8.88");
  await expect(items).toHaveCount(4);
});

test("deleting a claimed item asks first, naming who claimed it", async ({ page }) => {
  const id = await seedBill(page, {
    people: [
      { id: "a", name: "Alex", colorIndex: 0 },
      { id: "s", name: "Sam", colorIndex: 1 },
    ],
    items: [{ id: "i", name: "Pizza", quantity: 2, priceCents: 2000, claims: { a: 1, s: 1 } }],
  });
  await page.goto(`/bills/${id}/receipt`);
  await page.getByRole("button", { name: "Edit Pizza" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  await sheet.getByRole("button", { name: "Delete item" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Alex and Sam claimed this");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Edit Pizza" })).toBeVisible();

  await sheet.getByRole("button", { name: "Split into units" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Split into units" }).click();
  await expect(page.getByRole("button", { name: "Edit Pizza (1/2)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Pizza (2/2)" })).toBeVisible();
});
