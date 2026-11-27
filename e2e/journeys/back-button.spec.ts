import type { Page } from "@playwright/test";
import { dinnerBill } from "../data/dinner";
import { seedBill } from "../helpers/seed";
import { expect, goToStep, test } from "../fixtures";

// Journey 4 (#27): back-button discipline across the whole workspace. Starting from `/`,
// every sheet (paste, item, split-item, split-rest, adjustment, person, bill-details) is
// opened and closed with Back, on its own step, without leaving the page or reloading it.
// Because each Back consumed its sheet's entry, Back from Summary then walks the steps in
// reverse and lands on `/`.

type Alive = { __alive?: boolean };

async function backCloses(page: Page, sheet: string, dialog: string, open: () => Promise<void>) {
  const path = new URL(page.url()).pathname;
  await open();
  const d = page.getByRole("dialog", { name: dialog, exact: true });
  await expect(d).toBeVisible();
  expect(new URL(page.url()).search).toBe(`?sheet=${sheet}`);
  await page.goBack();
  await expect(d).toBeHidden();
  expect(new URL(page.url()).pathname).toBe(path);
  await expect(page).not.toHaveURL(/\?sheet=/);
  // A soft close: a full reload (an entry missing Next's __NA marker) would drop this flag.
  expect(await page.evaluate(() => (window as Alive).__alive)).toBe(true);
}

test("Back closes every sheet in place; Back from Summary walks the steps to /", async ({ page }) => {
  const id = await seedBill(page, dinnerBill({ unclaimed: ["Chocolate Torte"] }));
  await page.goto("/");
  await page.getByRole("link", { name: /Dinner for four/ }).click();
  await expect(page).toHaveURL(new RegExp(`/bills/${id}/split$`)); // /bills/[id] replaces → split
  await page.evaluate(() => ((window as Alive).__alive = true));

  await backCloses(page, "split-item", "Burrata", () =>
    page.getByRole("button", { name: "Split Burrata between people" }).click(),
  );
  await backCloses(page, "split-rest", "Split the rest", () =>
    page.getByRole("button", { name: "Split the rest evenly" }).click(),
  );

  await goToStep(page, "Receipt");
  await backCloses(page, "paste", "Paste receipt", () => page.getByRole("button", { name: "Paste receipt" }).click());
  await backCloses(page, "item", "Edit item", () => page.getByRole("button", { name: "Edit Burrata" }).click());

  await goToStep(page, "People");
  await backCloses(page, "person", "Ana", () => page.getByTestId("person-row-Ana").click());

  await goToStep(page, "Tip");
  await backCloses(page, "adjustment", "Add fee", () => page.getByRole("button", { name: "Add fee" }).click());

  await goToStep(page, "Summary");
  await backCloses(page, "bill-details", "Bill details", () =>
    page.getByRole("button", { name: /Dinner for four/ }).click(),
  );

  for (const step of ["tip", "people", "receipt", "split"]) {
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/bills/${id}/${step}$`));
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: /Dinner for four/ })).toBeVisible();
  expect(await page.evaluate(() => (window as Alive).__alive)).toBe(true); // all client-side
});
