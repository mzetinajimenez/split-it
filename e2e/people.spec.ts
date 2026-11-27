import { expect, test } from "@playwright/test";
import { seedBill } from "./helpers/seed";

test("add four people (one from a chip), rename, set payer, remove with confirm", async ({ page }) => {
  // A previous bill seeds the suggestion chip.
  await seedBill(page, { title: "Last week", people: [{ id: "d", name: "Dana", colorIndex: 0 }] });
  const id = await seedBill(page, {
    title: "Tacos",
    items: [
      { id: "i1", name: "Nachos", quantity: 1, priceCents: 1000, claims: {} },
      { id: "i2", name: "Pitcher", quantity: 1, priceCents: 2000, claims: {} },
    ],
  });
  await page.goto(`/bills/${id}/people`);
  await expect(page.getByText("Who’s splitting?")).toBeVisible();

  const field = page.getByLabel("Add a person");
  for (const name of ["Ana", "Ben", "Cy"]) {
    await field.fill(name);
    await field.press("Enter");
    await expect(page.getByTestId(`person-row-${name}`)).toBeVisible();
    await expect(field).toBeFocused();
  }
  await page.getByRole("group", { name: "Recent names" }).getByRole("button", { name: "Dana" }).click();
  await expect(page.getByTestId("person-row-Dana")).toBeVisible();
  await expect(page.getByRole("list", { name: "People" }).getByRole("listitem")).toHaveCount(4);
  // Added names drop out of the chips.
  await expect(page.getByRole("group", { name: "Recent names" })).toHaveCount(0);

  // Duplicate (case-insensitive): warned, still allowed.
  await field.fill("ana");
  await expect(page.getByText(/already a ana on this bill/)).toBeVisible();
  await field.fill("");

  // Rename.
  await page.getByTestId("person-row-Ben").click();
  await page.getByRole("dialog").getByLabel("Name").fill("Benny");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("person-row-Benny")).toBeVisible();

  // Payer: radio semantics.
  const cy = page.getByRole("radio", { name: "Cy" });
  await cy.click();
  await expect(cy).toBeChecked();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Cy" })).toBeChecked();
});

test("removing a person with claims confirms, strips claims, and clears the payer", async ({ page }) => {
  const id = await seedBill(page, {
    people: [
      { id: "alex", name: "Alex", colorIndex: 0 },
      { id: "sam", name: "Sam", colorIndex: 1 },
    ],
    items: [
      { id: "a", name: "A", quantity: 1, priceCents: 500, claims: { alex: 1 } },
      { id: "b", name: "B", quantity: 1, priceCents: 500, claims: { alex: 1 } },
      { id: "c", name: "C", quantity: 1, priceCents: 500, claims: { alex: 1, sam: 1 } },
      { id: "d", name: "D", quantity: 1, priceCents: 500, claims: { alex: 1, sam: 1 } },
    ],
    paidBy: "alex",
  });
  await page.goto(`/bills/${id}/people`);
  await expect(page.getByTestId("person-row-Alex")).toContainText("4 items");
  await page.getByTestId("person-row-Alex").click();
  await page.getByRole("button", { name: "Remove Alex" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Alex’s claims on 4 items will be removed (2 become unclaimed)",
  );
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("person-row-Alex")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Not set" })).toBeChecked();
  await expect(page.getByTestId("person-row-Sam")).toContainText("2 items");
});

test("same name twice is allowed", async ({ page }) => {
  const id = await seedBill(page, { people: [{ id: "s1", name: "Sam", colorIndex: 0 }] });
  await page.goto(`/bills/${id}/people`);
  await page.getByLabel("Add a person").fill("sam");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("list", { name: "People" }).getByRole("listitem")).toHaveCount(2);
});
