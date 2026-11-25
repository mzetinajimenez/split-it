# split-it — v1 Design Spec

**Date:** 2026-11-25
**Status:** Approved; decisions confirmed in §12
**Repo:** `mzetinajimenez/split-it`
**Sibling / reference architecture:** `mzetinajimenez/savor`

## 1. Vision

A mobile-first web app for splitting an itemized bill at the table, quickly and fairly.
Type or paste the receipt, add the people, then everyone taps the items they had. Shared
items can be split between any subset of the group (2 of 5 people shared the nachos), with
uneven shares if needed. Tax, tip, fees and discounts are spread fairly. Everyone sees what
they owe **to the cent**, and the per-person totals **add up exactly** to the bill.

It works with no account, no backend and no sign-up. It is a front end only: bills live on
the device, as savor's places do. Sharing works through a self-contained link.

Sibling project: **savor** (same author) is the reference for architecture, conventions and
workflow. split-it reuses its storage seam, overlay system, theme-token discipline, testing
layers and Vercel deploy, and changes only the domain.

## 2. Scope

### In scope (v1)

- **Bills:** create, rename, date, currency; a device-local history of past bills.
- **Items:** manual entry (name, quantity, line price), built for fast keyboard entry.
  **Paste receipt text:** a parser turns it into draft items, the user reviews them, then
  they are added.
- **People:** add, rename and remove; an avatar (initials + colour) for each; quick-add from
  names used on recent bills; who paid.
- **Claiming:** a "tap to claim" mode for the active person. A per-item split sheet covers
  any subset of people, weighted shares, "everyone", and splitting a quantity into units. A
  bulk action splits the rest evenly.
- **Adjustments:** tax (an amount or a %), tip (a % of the pre-tax or post-tax amount, or an
  amount), fees (service charge, delivery…) and discounts. Each is split in proportion to
  what people ordered or equally.
- **Summary:** a breakdown for each person, a check that the totals reconcile, who owes the
  payer, and a "mark paid" toggle. Share it as text, or as a read-only link that needs no
  server.
- **Settings:** default currency, default tip, backup export and import, clear data.
- An installable PWA, deployed on Vercel.

### Stretch (planned as issues, not v1-blocking)

- **Tip and fee split methods:** a dropdown with post-tax %, fixed amount and split
  equally. The engine supports all of them from day one (§5.4–5.5); the v1 UI exposes only
  pre-tax % in proportion to what each person ordered.
- **Payment deep links** (Venmo / Cash App / PayPal.me) on the summary.

### Explicitly deferred (designed for, not built)

| Deferred | v1 provision that keeps the door open |
|---|---|
| Live multi-device claiming (everyone claims on their own phone) | Bill-level sync trio, UUIDs everywhere, repo seam, versioned share payload. Phase 2 = Supabase (§9.2) |
| Accounts / auth | Not needed until sync exists |
| Multiple payers, running balances across bills (a Splitwise-style ledger) | `paidBy` is a single id; settlement is derived, never stored |
| Item modifiers / item-level discounts | Edit the item price, or add the modifier as its own item |
| Currency conversion | One currency per bill |
| Decimal-comma receipts (`12,50`) | The parser takes an options object; a locale switch is additive |
| Multi-line receipt items (price on the next line) | The parser reports `ignored` lines; a later heuristic is additive |
| Receipt photo → draft items (not in the MVP) | `ParsedReceipt` + `DraftReview` are the seam. **Free, on-device OCR first**; paid only if free can't meet the quality bar (§9.3) |

## 3. Architecture

Identical stack and seams to savor:

- **Next.js 16** (App Router, Turbopack) + **React 19**, **TypeScript strict**, `@/*` →
  repo root.
- **Tailwind CSS v4**: CSS-first `@theme` tokens in `app/globals.css`, no
  `tailwind.config`, and **no component library** (same decision and rationale as savor).
- **Dexie** (IndexedDB) + **dexie-react-hooks** (`useLiveQuery`) is the whole state layer:
  no context providers and no state library. Cross-cutting one-offs (toasts) use tiny
  module-level pub/sub.
- **zod** validates the single write path, the share-link decode and backup import.
- **Vitest** + **fake-indexeddb** test `lib/`, and **Playwright** drives the production
  build (mobile and desktop projects).
- **Real routes** for each step of a bill, so the phone's Back button works naturally.
  Quick actions are **bottom sheets**, with `?sheet=<name>` state exactly as in savor.
- **No server surface in v1.** The only planned route is the stretch `/api/receipt-scan`.
- Deployed on **Vercel** with an empty `next.config.mjs`.

### Data-flow rules (pinned)

- Components **never** import Dexie or `@/lib/db`. They read through `lib/hooks.ts` and
  write through `lib/repo.ts`.
- **Money math lives only in `lib/money.ts` and `lib/split.ts`.** Components never add,
  multiply or round amounts; they render `SplitResult` values through `formatMoney`.
- Splits are **derived at render** (`computeSplit(bill)`) and **never stored**. Changing a
  claim, tip or person recomputes everything instantly with nothing to migrate.

### File structure

```
app/
  layout.tsx                    # fonts, metadata/viewport, AppInit, nav, Toaster
  fonts.ts                      # next/font objects (owned by the theme task)
  globals.css                   # @theme tokens + motion keyframes
  page.tsx                      # "/" Bills — history list + New bill
  bills/[id]/
    layout.tsx                  # bill workspace: header (title/date), StepNav, not-found
    page.tsx                    # redirect → receipt (no items yet) or split
    receipt/page.tsx            # items editor + receipt totals (tax, printed subtotal/total) + paste import
    people/page.tsx             # participants + who paid
    split/page.tsx              # claim board
    tip/page.tsx                # tip, fees, discounts
    summary/page.tsx            # per-person results, reconcile, mark paid, share
  s/page.tsx                    # read-only shared bill decoded from the #fragment
  settings/page.tsx             # defaults, backup, clear data
  api/receipt-scan/route.ts     # STRETCH ONLY — Claude vision proxy (key-gated)
  components/
    AppInit.tsx  Sheet.tsx  Toast.tsx  ConfirmBox.tsx  ui.tsx
    nav/         BottomNav.tsx  NavRail.tsx  tabs.tsx
    bills/       BillRow.tsx  NewBillButton.tsx
    workspace/   BillHeader.tsx  StepNav.tsx  steps.ts
    receipt/     ItemRow.tsx  QuickAddRow.tsx  ItemSheet.tsx  ReceiptTotals.tsx  PasteReceiptSheet.tsx  DraftReview.tsx
    people/      Avatar.tsx  PersonRow.tsx  AddPersonField.tsx  PayerPicker.tsx
    split/       ClaimBoard.tsx  ActivePersonBar.tsx  ClaimableItem.tsx  ItemSplitSheet.tsx  SplitRestSheet.tsx  TotalsTray.tsx
    tip/         TipPicker.tsx  AdjustmentList.tsx  AdjustmentSheet.tsx
    summary/     PersonBreakdown.tsx  ReconcileBanner.tsx  ShareActions.tsx  PayLinks.tsx (stretch)
    settings/    DefaultsPanel.tsx  BackupPanel.tsx
lib/
  types.ts        # entity + result types (the contract every task codes against)
  money.ts        # parse/format minor units, allocate() largest-remainder, percent math
  split.ts        # computeSplit(bill) — pure, the heart of the app          ◀ heavily tested
  receipt/
    parse.ts      # paste text → ParsedReceipt (pure)
    fixtures/     # realistic receipt texts + expected output
  share.ts        # encode/decode share-link payload (CompressionStream + zod)
  summaryText.ts  # human-readable "who owes what" text
  people.ts       # initials(), next free colour index
  db.ts           # Dexie schema + ensureSeeded() + SCHEMA_VERSION            ◀ storage seam
  repo.ts         # THE WRITE PATH                                            ◀ storage seam
  hooks.ts        # THE READ PATH (query fns + useLiveQuery hooks + useDbInit)
  backup.ts       # export / parse / import JSON envelope
  sheetParam.ts  useSheetParam.ts  useModalA11y.ts  sheetDrag.ts   # ported from savor
e2e/              # Playwright journeys
scripts/generate-icons.mjs      # PWA icons with built-in zlib (ported from savor)
```

## 4. Data model

The **bill is the document**. One Dexie row per bill embeds its people, items, claims and
adjustments.

Why embedded rather than normalized tables:

- A bill is small (fewer than ~200 items) and is always edited, shared and exported as a
  unit.
- Every repo operation becomes one read-modify-write inside a Dexie `rw` transaction, with
  no cross-table consistency to keep.
- The share link and the backup each serialize one object.

If phase-2 live sync needs per-claim granularity, the repo seam hides the change from every
component.

```ts
// lib/types.ts (contract — other tasks code against exactly this)

export type SyncFields = { id: string; createdAt: string; updatedAt: string; deletedAt: string | null };

/** Integer minor units of the bill's currency (cents for USD, yen for JPY). NEVER a float. */
export type Cents = number;

export interface Person {
  id: string;            // crypto.randomUUID()
  name: string;          // 1..40 chars, trimmed
  colorIndex: number;    // 0..7 → --color-person-0..7
}

export interface Item {
  id: string;
  name: string;          // 1..80 chars
  quantity: number;      // integer ≥ 1, display only — priceCents is the LINE total
  priceCents: Cents;     // integer ≥ 0
  claims: Record<string, number>; // personId → shares (integer 1..99). {} = unclaimed. 0 is never stored.
}

export type AmountSpec =
  | { type: "amount"; cents: Cents }   // fixed amount, ≥ 0 (discounts are positive too; kind decides the sign)
  | { type: "percent"; bps: number };  // basis points: 825 = 8.25%, integer 0..10000

export type SplitMode = "proportional" | "equal";

export interface Adjustment {
  id: string;
  kind: "tax" | "tip" | "fee" | "discount";
  label: string;                       // "Tax", "Tip", "Service charge", "Happy hour"
  value: AmountSpec;
  basis?: "pretax" | "posttax";        // tip only; default "pretax"
  split: SplitMode;                    // default "proportional"
}

export interface Bill extends SyncFields {
  title: string;                       // default "Untitled bill"
  date: string;                        // YYYY-MM-DD, default today (local)
  currency: string;                    // ISO 4217, default from settings
  people: Person[];                    // ordered; order is display order AND tie-break order
  items: Item[];                       // ordered as on the receipt
  adjustments: Adjustment[];           // ≤ 1 tax, ≤ 1 tip, any number of fee/discount
  printed: { subtotalCents?: Cents; totalCents?: Cents }; // as printed on the receipt — reconciliation only
  paidBy: string | null;               // personId
  settled: string[];                   // personIds marked "paid back"
  notes?: string;
}

export interface Settings {
  id: "settings";
  currency: string;                    // default "USD"
  defaultTip: { bps: number; basis: "pretax" | "posttax" }; // default 2000 / "pretax"
  updatedAt: string;
}

export interface Meta { id: "meta"; schemaVersion: number; installId: string; createdAt: string; updatedAt: string }

export type BillInput = Partial<Pick<Bill, "title" | "date" | "currency" | "notes">>;
export type ItemInput = { name: string; quantity?: number; priceCents: Cents };
```

### Dexie schema v1

```
bills:    "id, date, updatedAt, deletedAt"
settings: "id"
meta:     "id"
```

`ensureSeeded()` creates `meta` and the default `settings` row on first run only and is
idempotent. Migrations are **additive-only** (savor's iron rule).

### Deletes

- **Rows** (bills) are tombstoned: `deletedAt` is set and every read filters it out.
- **Embedded entries** (an item, a person, an adjustment) are removed from the bill's arrays
  outright. That removal is an *update* to the bill row, and `updatedAt` records it. The
  bill is the sync unit.

### Repo API (the only write path)

Every function zod-validates its input and stamps `updatedAt`. Every function that changes
a bill runs inside `db.transaction("rw", db.bills, …)`.

```ts
createBill(input?: BillInput): Promise<Bill>      // seeds tip adjustment from settings.defaultTip
updateBill(id, patch: BillInput & { printed?: Bill["printed"] }): Promise<void>
deleteBill(id): Promise<void>                     // tombstone
importBill(snapshot: BillSnapshot): Promise<Bill> // from a share link / backup: fresh ids, new row

addItem(billId, input: ItemInput): Promise<Item>
addItems(billId, inputs: ItemInput[]): Promise<Item[]>   // paste/scan import, one transaction
updateItem(billId, itemId, patch: Partial<ItemInput>): Promise<void>
removeItem(billId, itemId): Promise<void>
explodeItem(billId, itemId): Promise<Item[]>      // qty N → N items of qty 1; prices via allocate(); claims cleared

addPerson(billId, name): Promise<Person>          // colorIndex = lowest unused (wraps after 8)
renamePerson(billId, personId, name): Promise<void>
removePerson(billId, personId): Promise<void>     // strips their claims everywhere, clears paidBy/settled
movePerson(billId, personId, toIndex): Promise<void>
setPayer(billId, personId | null): Promise<void>

toggleClaim(billId, itemId, personId): Promise<void>               // absent ↔ 1 share
setClaims(billId, itemId, claims: Record<string, number>): Promise<void> // replace the whole map
claimRemaining(billId, personIds: string[]): Promise<void>         // every unclaimed item → 1 share each

setTax(billId, value: AmountSpec | null): Promise<void>
setTip(billId, spec: { value: AmountSpec; basis: "pretax" | "posttax"; split: SplitMode } | null): Promise<void>
upsertAdjustment(billId, adj: Omit<Adjustment, "id"> & { id?: string }): Promise<Adjustment> // fee | discount
removeAdjustment(billId, adjustmentId): Promise<void>

setSettled(billId, personId, settled: boolean): Promise<void>
updateSettings(patch: Partial<Omit<Settings, "id" | "updatedAt">>): Promise<void>
```

### Read hooks

All are built on `useLiveQuery`, filter out tombstones, and return `undefined` while
loading.

```ts
useBills(): BillListEntry[] | undefined      // { bill, totalCents, status } sorted date desc, updatedAt desc
useBill(id): Bill | null | undefined         // null = not found or deleted
useSplit(id): { bill: Bill; split: SplitResult } | null | undefined
useRecentPeople(limit = 12): string[] | undefined // distinct names, most recent first, case-insensitive dedupe
useSettings(): Settings | undefined
useDbInit(): boolean                          // ensureSeeded + navigator.storage.persist(), once
```

## 5. The split engine (pinned semantics: do not change silently)

`computeSplit(bill: Bill): SplitResult` is pure and synchronous, with no React, no DOM and
no `Date`.

```ts
export interface PersonLine { itemId: string; name: string; shares: number; totalShares: number; cents: Cents }
export interface PersonResult {
  personId: string;
  lines: PersonLine[];          // their item portions, in receipt order
  subtotalCents: Cents;         // Σ lines
  discountCents: Cents;         // ≤ 0
  taxCents: Cents;
  feeCents: Cents;
  tipCents: Cents;
  totalCents: Cents;            // subtotal + discount + tax + fee + tip
  owesTo: string | null;        // paidBy, unless they ARE the payer (or no payer set)
  settled: boolean;
}
export interface SplitResult {
  people: PersonResult[];                                  // bill.people order
  itemsSubtotalCents: Cents;                               // Σ every item price
  adjustments: { id: string; kind: Adjustment["kind"]; label: string; cents: Cents }[]; // resolved, signed
  grandTotalCents: Cents;                                  // items + Σ adjustments
  unclaimed: { itemIds: string[]; itemsCents: Cents; totalCents: Cents }; // totalCents incl. its share of proportional adjustments
  status: "empty" | "unclaimed" | "balanced";
  printed: { subtotalDiffCents: Cents | null; totalDiffCents: Cents | null }; // computed − printed; null if not entered
}
```

### 5.1 Money

- Every amount is an **integer number of minor units** (`Cents`). The bill's currency gives
  the minor-unit digits (`Intl.NumberFormat(…).resolvedOptions().maximumFractionDigits`,
  2 for USD and 0 for JPY).
- Input is parsed once at the edge with `parseMoney("12.5", currency) → 1250` and displayed
  with `formatMoney(cents, currency)` (`Intl.NumberFormat`).
- zod caps every amount at `99_999_999` minor units and every shares value at 99, so no
  intermediate product exceeds `Number.MAX_SAFE_INTEGER` and **all money math is exact
  integer arithmetic** (no floats, no BigInt).
- **Percent → amount** happens once, at bill level: `percentOf(baseCents, bps) =
  round(baseCents × bps / 10000)`, with halves rounded away from zero.

### 5.2 `allocate(amount, weights, startIndex)` (largest remainder)

Splits an integer `amount` across non-negative integer `weights` (W = Σ weights):

1. `floor_i = ⌊amount × w_i / W⌋`, `rem_i = (amount × w_i) mod W`.
2. Leftover `k = amount − Σ floor_i` (always `< n`). Hand out one unit each to the `k`
   entries with the **largest `rem_i`**.
3. **Ties** go in rotating order starting at `startIndex` (`(startIndex + j) mod n`), so
   leftover pennies don't pile up on the first person.
4. A negative `amount` allocates `|amount|` and negates. W = 0 → all zeros (the caller
   decides the fallback).

**Invariants** (property-tested): `Σ result = amount` exactly; `|result_i − amount·w_i/W|
< 1`; zero weight → 0; deterministic for the same inputs.

### 5.3 Items

- Each item's `priceCents` is allocated across its claimants by their shares
  (`allocate(price, shares, startIndex = itemIndex)`). That gives each person's `lines` and
  `subtotalCents`.
- **Partial split "x of y":** the claim map has `x` keys with 1 share each. The other
  `y − x` people pay nothing for that item.
- **Uneven split:** shares 2 : 1 means two thirds and one third.
- An item with `{}` claims is **unclaimed**. It goes into `unclaimed.itemsCents` and is
  assigned to **no one**. Nothing is ever auto-assigned silently.

### 5.4 Adjustments: resolution order

Let `S` be the items subtotal (all items, claimed or not: it's what the receipt says).

1. **Discounts:** each one is `−amount` or `−percentOf(S, bps)`. Their total is `D` (≤ 0),
   clamped to `D ≥ −S` so the bill can't go negative. When clamped, the shortfall comes off
   the last discount.
2. **Tax:** `amount`, or `percentOf(S + D, bps)` (tax is levied on the discounted price).
   Call it `T`.
3. **Fees:** each one is `amount` or `percentOf(S + D, bps)`. Their total is `F`.
4. **Tip:** `amount`, or a percent of its basis. **`pretax` (the default) uses `S`, the
   pre-discount item subtotal (tip etiquette: tip on what was served).** `posttax` uses
   `S + D + T + F`. Call it `P`.
5. `grandTotalCents = S + D + T + F + P`.

### 5.5 Adjustments: allocation to people

- **`proportional`** (the default) allocates each adjustment's cents with weights equal to
  each person's `subtotalCents`, **plus one pseudo-participant "unclaimed"** whose weight
  is `unclaimed.itemsCents`. The pseudo-participant's portion is reported in
  `unclaimed.totalCents`.
  - *Why:* a person's proportional tax/tip then depends only on their own subtotal and `S`.
    Their running total during claiming is already final for what they've claimed, and it
    doesn't jump when someone else claims an item.
- **`equal`** allocates with weight 1 for **every person on the bill**, including people
  with no items. The unclaimed pseudo-participant takes no part.
- If every proportional weight is 0 (no items, only a flat fee), proportional falls back to
  equal.
- If the bill has no people, nothing is allocated and everything is reported unclaimed.
- Tie-break `startIndex` for adjustment `j` is `items.length + j`.

### 5.6 Results and status

- `totalCents_p = subtotal + discount + tax + fee + tip`.
- **Reconciliation invariant (property-tested): `Σ_p totalCents_p + unclaimed.totalCents ===
  grandTotalCents`, always.**
- `status`:
  - `"empty"`: no items.
  - `"unclaimed"`: some item has no claims.
  - `"balanced"`: otherwise. When balanced, `Σ_p totalCents_p === grandTotalCents`.
- `printed.subtotalDiffCents = S − printed.subtotalCents` (when entered).
  `printed.totalDiffCents = (S + D + T + F) − printed.totalCents`: the printed total is
  compared **before tip**, because receipts print the total before the tip line. An
  auto-gratuity printed on the receipt is entered as a **fee**, not as the tip.
- **Payer:** every person except the payer has `owesTo = paidBy`. The payer is owed the sum
  of everyone else's totals. With no payer set, `owesTo` is `null` everywhere and the
  summary asks "Who paid?".

### 5.7 Claim semantics

- Shares are integers from 1 to 99. A missing key means no claim, and 0 is never stored.
- **"Everyone"** writes 1 share for each *current* person. Adding a person later does **not**
  join them to existing items, because claims are explicit. The UI may offer to; the engine
  never does.
- Removing a person strips their claims, so items can become unclaimed again, and the UI
  shows that.
- `explodeItem` turns qty 3 / $20.00 into three qty-1 items of $6.67, $6.67 and $6.66
  (`allocate`), named "Beer (1/3)" … "Beer (3/3)", with claims cleared.

## 6. Receipt paste parser

`parseReceipt(text: string, opts?: { minorDigits?: number }): ParsedReceipt` is pure and
deterministic.

```ts
export interface DraftItem { name: string; quantity: number; priceCents: Cents; line: number; confidence: "high" | "low" }
export interface ParsedReceipt {
  items: DraftItem[];
  totals: { subtotalCents?: Cents; taxCents?: Cents; tipCents?: Cents; totalCents?: Cents };
  ignored: { line: number; text: string; reason: "no_price" | "payment" | "total" | "noise" }[];
}
```

- **One item per line, with a trailing price token.** Optional `-`, an optional currency
  symbol (`$ € £ ¥`), digits with optional `,` thousands separators, then `.` and the
  minor-unit digits. A trailing currency code or `T`/`F` tax flag is tolerated
  (`12.00 T`).
- **Quantity forms:** `2 x Burger`, `2x Burger`, `2 Burger`, `Burger x2`, `Burger (2)`,
  `2 @ 6.00  12.00` (the line total wins), and `2 @ 6.00` with no total (qty × unit).
- **Keyword lines** (case-insensitive) fill `totals` and are not items:
  - `subtotal`, `sub-total`, `sub total` → subtotal
  - `tax`, `vat`, `gst`, `hst`, `sales tax` → tax
  - `tip`, `gratuity` → tip
  - `total`, `amount due`, `balance due` → total
- **Payment and noise lines** are ignored: `visa`, `mastercard`, `amex`, `cash`, `change`,
  `card`, `auth`, `approval`, `tender`. So are lines with no price (headers, addresses,
  dates).
- **Name cleanup:** trim, collapse whitespace, strip dot leaders (`Burger ..... 12.00`).
  A line that leaves no name is ignored.
- `confidence: "low"` marks a name shorter than 2 letters, an implausible quantity (> 50),
  or a price that looks like a date or a time.
- **Never auto-commit.** Parsed output always goes to the review UI, where the user can
  edit, deselect and merge lines before `addItems`.
  - The detected tax pre-fills the tax amount.
  - The detected subtotal and total pre-fill `printed`.
  - A detected tip is shown but **not** applied automatically; the Tip step owns the tip.
- **Corpus-driven tests:** `lib/receipt/fixtures/*.txt` plus the expected JSON, with at
  least 8 realistic receipts: a sit-down restaurant, a bar tab, a delivery-app copy-paste,
  a big-box store, a receipt with discounts, a quantity-heavy one, a messy OCR-style one,
  and a non-USD/JPY one.

## 7. Share link

- `encodeShare(bill): Promise<string>` returns `"1." + base64url(deflate-raw(JSON(compact
  snapshot)))`, using the built-in `CompressionStream` (Safari 16.4+, Chrome 80+,
  Firefox 113+). No dependency.
- **Compact snapshot:** positional arrays, with person *indices* in place of UUIDs. It holds
  no sync fields and no device ids. `BillSnapshot` is the type shared with `importBill` and
  backup.
- **URL: `/s#<payload>`.** The **fragment never reaches a server**: nothing is logged, it is
  private by construction and it works on static hosting.
- `decodeShare(payload): Promise<BillSnapshot>` checks the version prefix, inflates and
  zod-validates. If anything fails, it throws `ShareDecodeError`, and the UI says the link
  is broken or comes from a newer version.
- **Size budget (tested):** a 40-item, 8-person bill encodes to fewer than 2,000 characters.
- `/s` renders the summary **read-only**, plus **"Save a copy"** (`importBill`, fresh ids).
- `summaryText(bill, split)` produces plain text for `navigator.share` (falling back to the
  clipboard):

  ```
  Tacos — Nov 25 · $142.80
  Alex owes Sam $38.20
  Blair owes Sam $41.15
  Sam paid · their share $63.45
  ```

## 8. Screens and interaction

Mobile-first and one-handed, used at a dim restaurant table: ≥44px targets, `active:` press
states, `md:hover:` only, safe-area insets, `h-dvh` sheets, inputs ≥16px
(`inputMode="decimal"` for money), and pinch-zoom left enabled.

### Global navigation

- Outside a bill there is a **BottomNav** (< md) / **NavRail** (≥ md) with two tabs,
  **Bills** and **Settings**, and an elevated **＋ New bill** FAB.
- **Inside `/bills/[id]/*`**, the global BottomNav is hidden and a **StepNav** takes its
  fixed-bottom slot:
  - Five steps: **Receipt · People · Split · Tip · Summary**.
  - Badges: the Split step shows its unclaimed count, Summary shows ✓ when balanced.
  - Steps are freely jumpable tabs, not a forced wizard.
- On desktop the StepNav renders as a segmented bar under the bill header. A back control
  in the header goes to `/`.

### `/` Bills

- **Concise history, no fluff.** One dense line per bill: the title, a short date
  ("Tonight", "Nov 12") and the grand total, plus a small status dot (attention =
  unclaimed, accent = settled). No avatars, cards, thumbnails or previews.
  - Rows are grouped under month headers.
  - Nothing extra is stored for history: each row is derived from the bill document, which
    is already compact (about 1–3 KB).
- Tapping a row opens the bill.
- **New bill** runs `createBill()` and then `router.push(/bills/[id]/receipt)`.
- The empty state invites "Split your first bill". Delete uses `ConfirmBox` (a tombstone).

### Receipt

- **Item list:** rows of name, `qty ×` and price. Tapping a row opens `ItemSheet`
  (edit, delete, explode a qty).
- **QuickAddRow** is pinned at the end. Its name and price fields commit on Enter and put
  focus back in the name field, so you can type a whole receipt without touching the
  screen.
- **Paste receipt** opens `PasteReceiptSheet` (`?sheet=paste`): a textarea, then **Parse**,
  then `DraftReview`. Every draft is an editable, checkable row, low-confidence rows are
  flagged, and "Add N items" calls `addItems`. Detected tax and totals pre-fill
  `ReceiptTotals`.
- **ReceiptTotals** holds the tax (an amount or a %), the printed subtotal and the printed
  total, with a live mismatch banner ("Items add up to $96.50 — receipt says $98.50").

### People

- `AddPersonField` has suggestion chips from `useRecentPeople()`.
- Each row shows an avatar, the name, an item count and the person's running total.
  Tapping it renames; removing someone who has claims needs a `ConfirmBox` that names how
  many items become unclaimed.
- `PayerPicker` asks "Who paid?".

### Split (the claim board, the core interaction)

- **ActivePersonBar** sits at the top: a horizontally scrolling row of avatars plus
  "Nobody". The selected person gets a gold ring.
- **Tap to claim.** With an active person, tapping an item **toggles their claim** (1
  share), with instant feedback: the avatar joins the item's stack and the totals update.
  With no active person, a tap opens the split sheet.
- **Each `ClaimableItem`** shows the name, the price and the claimant avatar stack. With 2
  or more claimants it shows their shares as "½ each" or "⅔ / ⅓". A chevron button **always
  opens `ItemSplitSheet`**. That is the accessible path; long-press is an accelerator only.
- **Unclaimed items** are flagged with the **`attention`** token, never `danger`: unclaimed
  is a to-do, not an error.
- **Filter chips:** All · Unclaimed · Mine (the active person's items).
- **ItemSplitSheet** (`?sheet=split-item`, with the item id kept in local state, never in
  the URL):
  - An "Everyone" toggle.
  - A row for each person with a toggle, a share stepper (− n +) and a **live preview of
    their cents**.
  - "Split into units" when qty > 1, and "Clear".
  - The preview calls the same `allocate` as the engine (a helper re-exported from
    `lib/split.ts`), so what you preview is what you get.
- **SplitRestSheet** splits the rest evenly: choose people (everyone by default), then
  `claimRemaining`.
- **TotalsTray** sticks above the StepNav. Collapsed, it reads "Unclaimed $18.50 · 3
  items" or "All claimed ✓". Expanded, it lists each person's running total including tax
  and tip. Tapping a person makes them the active person and filters to Mine.

### Tip

- **v1:** `TipPicker` offers chips for 0, 15, 18, **20 (default)** and 22%, plus a custom
  %.
  - The tip is always on the **pre-tax** subtotal and split **in proportion** to what each
    person ordered.
  - It shows the live tip amount.
- `AdjustmentList` and `AdjustmentSheet` add, edit and remove fees and discounts: a label
  and an amount or %, always split in proportion in v1.
- **Follow-up:** a "Split method" dropdown for the tip and each fee or discount: pre-tax %,
  post-tax %, fixed amount, split equally. It's UI only, because the engine already
  implements every mode.

### Summary

- **ReconcileBanner** shows one of three states:
  - Balanced ✓ ("adds up to $142.80").
  - Unclaimed: "$18.50 unclaimed", with a link to Split.
  - Printed mismatch: a warning, which doesn't block.
- **PersonBreakdown** has a row for each person: avatar, name and a **big total**, with an
  expandable breakdown (the item lines with fractions, "½ Nachos $6.25", then subtotal,
  discount, tax, fees and tip). It shows "owes {payer}" and a **Mark paid** toggle.
- **ShareActions:** "Share summary" (text), and "Copy link" (the read-only `/s#…` link).

### Settings

- The default currency, plus the default tip % and basis.
- Backup export and import (JSON envelope, zod-validated before anything changes, and
  confirmed before replacing).
- "Clear all data" (behind a `ConfirmBox`, then re-seed).

### Theme

split-it gets **its own visual identity** but keeps **savor's token discipline**:

- Tokens only: no raw hex in `app/`, enforced by a ported `theme-contract.test.ts`.
- Contrast is a property of the pair, not the token.
- Text on an accent fill uses `on-accent`, never white.
- `danger` means destructive or error, and nothing else.

**Semantic token names** are fixed now so parallel tasks can use them before the palette
lands:

| Purpose | Tokens |
|---|---|
| Surfaces | `ground`, `ground-deep`, `raised`, `rule`, `rule-strong` |
| Text | `ink`, `ink-muted` |
| Accent (yes, primary, active) | `accent`, `accent-deep`, `on-accent` |
| Needs action (unclaimed), non-error | `attention` |
| Destructive and error only | `danger`, `danger-deep` |
| Person colours (8 avatar colours, each text-legal with `on-person`) | `person-0`…`person-7`, `on-person` |
| Fonts | `font-display`, `font-body`, `font-mono` (tabular figures for every money value) |

The proposed direction is **"Thermal"**: receipt paper (a warm off-white ground with ink
text), monospace tabular figures for money, and one confident accent. This is open
decision §12.1.

## 9. Infrastructure

### 9.1 v1: no backend

| Need | Choice | Why |
|---|---|---|
| Hosting | **Vercel** (Hobby) | Same as savor, with zero config. Connect the repo now so **every PR gets a preview URL you can open on your phone**. |
| Persistence | **IndexedDB via Dexie** | Device-local history, works offline, no account. |
| Sharing | **URL-fragment payload** | No server, no database, private by construction. |
| CI | **GitHub Actions** | lint, typecheck, unit, build and e2e on every PR (important with many parallel agents). |

### 9.2 Phase 2: live multi-device claiming (not v1)

When everyone should claim from their own phone at once:

- **Recommendation: Supabase.** Postgres (a `bills` row plus a `claims` table) gives:
  - **Realtime**, with presence for "who's here" and Postgres changes for claims.
  - **Anonymous sign-ins** (no accounts).
  - **Row-level security**, keyed to an unguessable bill id or a join code.
  - A first-class **Vercel integration** that injects the env vars.
- **Not MongoDB.** Atlas Device Sync and App Services are deprecated, so there is no
  browser-side realtime subscription. We'd have to run our own websocket server, and the
  document model offers nothing Postgres JSONB doesn't.
- **The alternatives considered** were Liveblocks, PartyKit / Cloudflare Durable Objects,
  and Firebase. They are fine for presence, but each is a second paradigm for persistence.
  Supabase covers both.
- **Integration point:** `lib/repo.ts` grows a sync layer behind the same functions. Claims
  become per-row upserts (last-writer-wins on `updatedAt`), and hooks keep reading Dexie,
  which a background subscription fills.

### 9.3 Future: receipt photo scanning (not in the MVP)

**Order of preference: free and highest-quality first. Paid is considered only if no free
option meets the quality bar** (≥ 90% of line items right, nothing invented, on a
corpus of real receipt photos).

- **Free candidates, all on-device, with no server or key:**
  - **Tesseract.js**: mature. About 3 MB of wasm plus language data. Its text is fed to
    `parseReceipt`. It is weak on crumpled, thermal or low-light receipts.
  - **Transformers.js document models**: for example a receipt-finetuned Donut (trained on
    CORD), if an ONNX build is available, or TrOCR / Florence-2. These are tens to hundreds
    of MB, lazy-loaded and cached. They can return structured line items directly.
  - **PaddleOCR through onnxruntime-web**: strong text detection and recognition. Its text is
    fed to `parseReceipt`.
  - **The browser's built-in `TextDetector` (Shape Detection API)**: zero download, but
    limited and inconsistent browser support, so use it opportunistically.
- **Paid fallback, only if the free options fail the bar: Claude vision through `app/api/receipt-scan/route.ts`.**
  - The client downscales the image (longest edge ≤ 1600px, JPEG) and POSTs it.
  - The route calls the Anthropic TypeScript SDK `client.messages.parse()` with a base64
    `image` block and `output_config.format` (`zodOutputFormat` of a schema matching
    `ParsedReceipt`), on model `claude-opus-5-5`.
  - The result goes to **the same `DraftReview` UI** as paste, so it is never committed
    automatically.
- **Key-gated:** `ANTHROPIC_API_KEY` is a Vercel env var. Without it, the "Scan" button
  shows an honest "unavailable" state, exactly like savor's map without its Protomaps key.
- **Cost:** about $0.02–0.03 a receipt at Opus 5.5 prices. **Abuse guard required** before
  production, because a public route spends real money: a Vercel WAF rate-limit rule, a
  size cap, and optionally a shared passphrase.
- **Privacy note in the UI:** the photo is sent to Anthropic for parsing.

Whichever wins, the output goes through `DraftReview` and is never committed
automatically.

## 10. Testing

1. **Pure logic** (`lib/money.ts`, `lib/split.ts`, `lib/receipt/parse.ts`, `lib/share.ts`,
   `lib/summaryText.ts`):
   - Unit tests, plus **seeded randomized property tests** for `allocate` and
     `computeSplit` (a hand-rolled mulberry32 PRNG, so no new dependency).
   - Invariants: exact sums, the reconciliation invariant, per-person error under 1 cent,
     and determinism.
2. **Repo and hooks** (`lib/db.ts`, `lib/repo.ts`, the query functions in `lib/hooks.ts`)
   against **fake-indexeddb**:
   - CRUD, tombstones and seeding idempotency.
   - `removePerson` stripping claims.
   - `explodeItem` sums, and the `importBill` round trip.
3. **E2E** (Playwright, against the production build on port 3100, mobile + desktop
   projects):
   - First run.
   - Paste then import.
   - Claim, including an x-of-y partial split and weighted shares.
   - Tip and summary reconciling to the cent.
   - The share-link round trip.
   - Back closing sheets.

Components get no jsdom tests (as in savor). The browser layer is covered by Playwright.

## 11. Pinned conventions (seed for CLAUDE.md)

Everything in savor's CLAUDE.md applies except the map and lookup specifics, in particular:

- trunk-style conventional commits
- green before every commit (`npm test`, `npm run lint`, `npm run build`, `npm run
  test:e2e`)
- **ask before adding dependencies**
- additive-only migrations
- read through hooks, write through repo
- `Sheet` + `useModalA11y` for every overlay
- sheet state in `?sheet=` (never `useState`, never an entity id in the query)
- `ConfirmBox` for destructive confirms
- a toast on a failed write
- ≥44px targets
- `md:hover:` only
- a framework-free `lib/`

split-it adds:

- **Integer minor units everywhere.** No floats on money, ever. Only `lib/money.ts` parses
  and formats, and only `lib/split.ts` allocates.
- **Totals always reconcile.** `Σ people + unclaimed === grand total` is a tested
  invariant. Any change to the engine keeps it.
- **Nothing is auto-assigned.** Unclaimed stays unclaimed until a person taps or chooses
  "split the rest".
- **Parsed and scanned items are never committed without review.**
- **Unclaimed is `attention`, not `danger`.**
- **The long-press split peek is an accelerator.** The chevron to `ItemSplitSheet` is the
  canonical, accessible path.

## 12. Decisions (confirmed 2026-11-25)

1. **Visual identity:** split-it gets **its own style**, a new identity built on the
   semantic token names above. The "Thermal" receipt-paper direction is the starting
   proposal for #4.
2. **Persistence:** a **Dexie bill history**, kept **concise**: one dense line per bill, no
   fluff, and nothing stored beyond the bill document itself.
3. **Photo scanning:** **out of the MVP.** When it is picked up, **free on-device options
   come first**, and paid ones only if free can't meet the quality bar (§9.3).
4. **Tip default:** **20% of the pre-tax subtotal, split in proportion** to each person's
   spend. A follow-up adds a split-method dropdown: post-tax, fixed amount, equal.
5. **Live multi-device claiming:** **phase 2** on Supabase. v1 is pass the phone, plus a
   read-only share link.
6. **App name:** working name **split-it**.
