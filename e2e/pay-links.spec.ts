import { expect, test } from "./fixtures";
import { seedBill } from "./helpers/seed";

// #30: the payer's handles on the People step become pay links on the Summary. `test` from
// ./fixtures fails on any request outside the app origin, so these also pin that handles are
// never sent anywhere: the links are only followed if someone taps one.

const people = [
  { id: "sam", name: "Sam", colorIndex: 0 },
  { id: "alex", name: "Alex", colorIndex: 1 },
  { id: "blair", name: "Blair", colorIndex: 2 },
];
const noTip = { adjustments: [] };

test("payer adds handles on People; Summary shows exact pay links per non-payer", async ({ page }) => {
  const id = await seedBill(page, {
    title: "Tacos & beer",
    people,
    items: [
      { id: "t", name: "Tacos", quantity: 1, priceCents: 3000, claims: { sam: 1, alex: 1, blair: 1 } },
      { id: "b", name: "Beer", quantity: 1, priceCents: 815, claims: { alex: 1 } },
    ],
    ...noTip,
    paidBy: "sam",
  });

  await page.goto(`/bills/${id}/people`);
  await page.getByRole("button", { name: "Add Sam’s payment handles" }).click();
  await page.getByLabel("Venmo username").fill("https://venmo.com/u/sam-lee");
  await expect(page.getByLabel("Venmo username")).toHaveValue("sam-lee");
  await page.getByLabel("Cash App $Cashtag").fill("$samlee");
  await expect(page.getByLabel("Cash App $Cashtag")).toHaveValue("samlee");
  await page.getByLabel("PayPal.me name").fill("Sam/Lee");
  await expect(page.getByText("Letters and numbers only (up to 20)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save handles" })).toBeDisabled();
  await page.getByLabel("PayPal.me name").fill("SamLee");
  await page.getByRole("button", { name: "Save handles" }).click();
  await expect(page.getByText("Saved payment handles")).toBeVisible();

  await page.goto(`/bills/${id}/summary`);
  const pay = page.getByTestId("pay-links");
  await expect(pay.getByRole("heading", { name: "Pay Sam" })).toBeVisible();
  // Alex: 10.00 + 8.15 = 18.15. Blair: 10.00. The payer gets no row.
  await expect(pay.getByTestId("pay-Sam")).toHaveCount(0);
  const note = "note=Tacos+%26+beer+%28split-it%29";
  await expect(pay.getByRole("link", { name: "Alex: pay Sam with Venmo" })).toHaveAttribute(
    "href",
    `https://venmo.com/sam-lee?txn=pay&amount=18.15&${note}`,
  );
  await expect(pay.getByRole("link", { name: "Alex: pay Sam with Cash App" })).toHaveAttribute(
    "href",
    "https://cash.app/$samlee/18.15",
  );
  await expect(pay.getByRole("link", { name: "Blair: pay Sam with PayPal" })).toHaveAttribute(
    "href",
    "https://paypal.me/SamLee/10.00USD",
  );
  for (const link of await pay.getByRole("link").all()) {
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }

  // Marking Blair paid removes their row.
  await page.getByTestId("person-Blair").getByRole("button", { name: "Mark paid" }).click();
  await expect(pay.getByTestId("pay-Blair")).toHaveCount(0);
  await expect(pay.getByTestId("pay-Alex")).toBeVisible();
});

test("a JPY bill shows only PayPal, in whole yen", async ({ page }) => {
  const id = await seedBill(page, {
    currency: "JPY",
    people: people.map((p) => (p.id === "sam" ? { ...p, handles: { venmo: "sam-lee", cashtag: "samlee", paypal: "SamLee" } } : p)),
    items: [{ id: "r", name: "Ramen", quantity: 1, priceCents: 3000, claims: { sam: 1, alex: 1, blair: 1 } }],
    ...noTip,
    paidBy: "sam",
  });
  await page.goto(`/bills/${id}/summary`);
  const alex = page.getByTestId("pay-Alex");
  await expect(alex.getByRole("link")).toHaveCount(1);
  await expect(alex.getByRole("link", { name: /PayPal/ })).toHaveAttribute("href", "https://paypal.me/SamLee/1000JPY");
});

test("hints instead of links: no handles, unsupported currency, unclaimed items", async ({ page }) => {
  const id = await seedBill(page, {
    people,
    items: [{ id: "t", name: "Tacos", quantity: 1, priceCents: 3000, claims: { sam: 1, alex: 1 } }],
    ...noTip,
    paidBy: "sam",
  });
  await page.goto(`/bills/${id}/summary`);
  await expect(page.getByTestId("pay-links")).toContainText("Add Sam’s Venmo, Cash App or PayPal.me");
  await page.getByTestId("pay-links").getByRole("link", { name: "People step" }).click();
  await expect(page).toHaveURL(new RegExp(`/bills/${id}/people$`));

  const cad = await seedBill(page, {
    currency: "CAD",
    people: people.map((p) => (p.id === "sam" ? { ...p, handles: { venmo: "sam-lee" } } : p)),
    items: [{ id: "t", name: "Tacos", quantity: 1, priceCents: 3000, claims: { sam: 1, alex: 1 } }],
    ...noTip,
    paidBy: "sam",
  });
  await page.goto(`/bills/${cad}/summary`);
  await expect(page.getByTestId("pay-links")).toContainText("don’t take CAD");
  await expect(page.getByTestId("pay-links").getByRole("link")).toHaveCount(0);

  const partial = await seedBill(page, {
    people: people.map((p) => (p.id === "sam" ? { ...p, handles: { cashtag: "samlee" } } : p)),
    items: [
      { id: "t", name: "Tacos", quantity: 1, priceCents: 3000, claims: { alex: 1 } },
      { id: "x", name: "Mystery", quantity: 1, priceCents: 500, claims: {} },
    ],
    ...noTip,
    paidBy: "sam",
  });
  await page.goto(`/bills/${partial}/summary`);
  await expect(page.getByTestId("pay-links")).toContainText("once every item is claimed");
  await expect(page.getByTestId("pay-links").getByRole("link")).toHaveCount(0);
});

test("no payer, no pay-links section", async ({ page }) => {
  const id = await seedBill(page, {
    people,
    items: [{ id: "t", name: "Tacos", quantity: 1, priceCents: 3000, claims: { sam: 1, alex: 1 } }],
    ...noTip,
  });
  await page.goto(`/bills/${id}/summary`);
  await expect(page.getByTestId("person-Alex")).toBeVisible();
  await expect(page.getByTestId("pay-links")).toHaveCount(0);
});
