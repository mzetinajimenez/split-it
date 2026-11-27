import { expect, test } from "@playwright/test";
import { seedBill } from "./helpers/seed";

// Bill workspace shell (#14): header, StepNav, redirect, not-found.

const person = (id: string, name: string, colorIndex: number) => ({ id, name, colorIndex });
const item = (id: string, name: string, priceCents: number) => ({ id, name, quantity: 1, priceCents, claims: {} });

const STEPS = ["receipt", "people", "split", "tip", "summary"] as const;
const LABEL = { receipt: "Receipt", people: "People", split: "Split", tip: "Tip", summary: "Summary" };

test("visits every step, then Back ×5 lands on /", async ({ page }) => {
  await page.goto("/");
  const id = await seedBill(page, {
    title: "Tacos night",
    people: [person("p-ana", "Ana", 0)],
    items: [item("i-1", "Tacos", 1850), item("i-2", "Soda", 500)],
  });
  await page.goto("/");
  await page.goto(`/bills/${id}`); // redirects (replace) to split: the bill has items
  await expect(page).toHaveURL(new RegExp(`/bills/${id}/split$`));

  const nav = page.getByRole("navigation", { name: "Bill steps" });
  // Split carries the unclaimed count in its accessible name.
  await expect(nav.getByRole("link", { name: "Split, 2 unclaimed" })).toHaveAttribute("aria-current", "step");

  // Visit the four other steps in turn: five history entries (index → split, then four pushes).
  for (const step of ["receipt", "people", "tip", "summary"] as const) {
    await nav.getByRole("link", { name: new RegExp(`^${LABEL[step]}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/bills/${id}/${step}$`));
    await expect(nav.locator('[aria-current="step"]')).toHaveCount(1);
    await expect(nav.getByRole("link", { name: new RegExp(`^${LABEL[step]}`) })).toHaveAttribute("aria-current", "step");
  }
  await expect(page.getByRole("button", { name: /Tacos night/ })).toBeVisible();

  // Back through the four pushed steps, then once more to leave the workspace.
  for (const step of ["tip", "people", "receipt"] as const) {
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/bills/${id}/${step}$`));
  }
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/bills/${id}/split$`));
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test("step targets are at least 44px", async ({ page }) => {
  await page.goto("/");
  const id = await seedBill(page, { items: [item("i-1", "Tacos", 1850)] });
  await page.goto(`/bills/${id}/split`);
  const nav = page.getByRole("navigation", { name: "Bill steps" });
  for (const step of STEPS) {
    const box = await nav.getByRole("link", { name: new RegExp(`^${LABEL[step]}`) }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});

test("an empty bill redirects to receipt", async ({ page }) => {
  await page.goto("/");
  const id = await seedBill(page, {});
  await page.goto(`/bills/${id}`);
  await expect(page).toHaveURL(new RegExp(`/bills/${id}/receipt$`));
});

test("bill-details sheet edits the title; Back closes it", async ({ page }) => {
  await page.goto("/");
  const id = await seedBill(page, { title: "Old name", items: [item("i-1", "Tacos", 1850)] });
  await page.goto(`/bills/${id}/split`);
  await page.getByRole("button", { name: /Old name/ }).click();
  const sheet = page.getByRole("dialog", { name: "Bill details" });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\?sheet=bill-details/);
  await page.goBack();
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: /Old name/ }).click();
  await sheet.getByLabel("Title").fill("New name");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: /New name/ })).toBeVisible();
});

test("the totals tray clears the step bar on the split page", async ({ page, isMobile }) => {
  await page.goto("/");
  const id = await seedBill(page, {
    people: [person("p-ana", "Ana", 0)],
    items: [item("i-1", "Tacos", 1850)],
  });
  await page.goto(`/bills/${id}/split`);
  const tray = await page.getByTestId("totals-tray").boundingBox();
  const nav = await page.getByRole("navigation", { name: "Bill steps" }).boundingBox();
  expect(tray).not.toBeNull();
  if (isMobile) expect(tray!.y + tray!.height).toBeLessThanOrEqual(nav!.y + 0.5);
  else expect(nav!.y + nav!.height).toBeLessThanOrEqual(tray!.y); // segmented bar sits above content
});

test("an unknown bill id shows not-found with a way back", async ({ page }) => {
  await page.goto("/bills/does-not-exist/split");
  await expect(page.getByRole("heading", { name: "Bill not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to bills" }).click();
  await expect(page).toHaveURL(/\/$/);
});
