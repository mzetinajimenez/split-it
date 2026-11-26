# CLAUDE.md

split-it is a mobile-first web app for splitting an itemized bill at the table. Type or
paste the receipt, add the people, and everyone taps the items they had.

**The spec is the source of truth:**
[`docs/superpowers/specs/2026-11-25-split-it-design.md`](docs/superpowers/specs/2026-11-25-split-it-design.md).
The work is broken down in
[`docs/superpowers/plans/2026-11-25-split-it-v1-plan.md`](docs/superpowers/plans/2026-11-25-split-it-v1-plan.md).
If code and spec disagree, raise it; don't change the spec silently.

## Commands

```bash
npm run dev        # dev server (Turbopack), http://localhost:3000
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm test           # vitest (lib/**/*.test.ts)
npm run build      # production build
npm run test:e2e   # Playwright against the production build on :3100 (mobile + desktop)
```

## Workflow

- **Trunk-style, conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, `test:`,
  `refactor:`). Small PRs against `main`.
- **Green before every commit:** `npm run lint && npm run typecheck && npm test && npm run
  build && npm run test:e2e`. Never skip, disable or weaken a test to get green.
- **Ask before adding a dependency.** The pinned set is: `next@16.2`, `react@19.2`,
  `react-dom`, `dexie`, `dexie-react-hooks`, `zod@4`; dev: `typescript`, `@types/*`,
  `tailwindcss@4`, `@tailwindcss/postcss`, `eslint@9`, `eslint-config-next`, `vitest@4`,
  `fake-indexeddb`, `@playwright/test`.
- Touch only the files your issue owns, plus the plan's pre-agreed shared touch points.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19, TypeScript strict, `@/*` → repo root.
- Tailwind CSS v4: CSS-first `@theme` tokens in `app/globals.css`. No `tailwind.config`,
  no component library.
- Dexie (IndexedDB) + `dexie-react-hooks` (`useLiveQuery`) is the whole state layer. No
  context providers, no state library. Cross-cutting one-offs (toasts) use tiny
  module-level pub/sub.
- zod validates the single write path, the share-link decode and backup import.
- Vitest + fake-indexeddb test `lib/`; Playwright drives the production build. Components
  get no jsdom tests.
- No server surface in v1. Deployed on Vercel with an empty `next.config.mjs`.

## Conventions

### Data flow

- **Read through hooks, write through repo.** Components never import Dexie or `@/lib/db`;
  they read via `lib/hooks.ts` and write via `lib/repo.ts`.
- **Migrations are additive only.** Never rewrite or drop existing data in a schema bump.
- Splits are **derived at render** (`computeSplit(bill)`) and never stored.
- `lib/` is **framework-free**: no React, no Next imports outside `lib/hooks.ts`.

### Money (split-it specific)

- **Integer minor units everywhere.** No floats on money, ever. Only `lib/money.ts` parses
  and formats, and only `lib/split.ts` allocates. Components never add, multiply or round
  amounts; they render `SplitResult` values through `formatMoney`.
- **Totals always reconcile.** `Σ people + unclaimed === grand total` is a tested
  invariant. Any change to the engine keeps it.
- **Nothing is auto-assigned.** Unclaimed stays unclaimed until a person taps or chooses
  "split the rest".
- **Parsed and scanned items are never committed without review** (`DraftReview`).

### UI

- `Sheet` + `useModalA11y` for every overlay.
- Sheet state lives in `?sheet=<name>`: never `useState`, never an entity id in the query.
- `ConfirmBox` for destructive confirms.
- A toast on every failed write.
- Touch targets ≥ 44px. Use `md:hover:` only (no bare `hover:`, which sticks on touch).
- Use theme tokens only; no raw colours.
- **Unclaimed is `attention`, not `danger`.**
- **The long-press split peek is an accelerator.** The chevron to `ItemSplitSheet` is the
  canonical, accessible path.

## Architecture

Files marked *(planned)* don't exist yet; see spec §3 and the plan for which issue owns
each.

```
app/
  layout.tsx                    # metadata/viewport; later fonts, AppInit, nav, Toaster
  fonts.ts                      # (planned) next/font objects
  globals.css                   # Tailwind import; (planned) @theme tokens + motion keyframes
  page.tsx                      # "/" placeholder; (planned) Bills history list + New bill
  bills/[id]/                   # (planned) bill workspace
    layout.tsx  page.tsx
    receipt/  people/  split/  tip/  summary/   page.tsx each
  s/page.tsx                    # (planned) read-only shared bill from the #fragment
  settings/page.tsx             # (planned) defaults, backup, clear data
  api/receipt-scan/route.ts     # (planned, stretch only) key-gated vision proxy
  components/                   # (planned)
    AppInit.tsx  Sheet.tsx  Toast.tsx  ConfirmBox.tsx  ui.tsx
    nav/  bills/  workspace/  receipt/  people/  split/  tip/  summary/  settings/
lib/                            # (planned)
  types.ts        # entity + result types (the contract)
  money.ts        # parse/format minor units, allocate(), percent math
  split.ts        # computeSplit(bill), pure
  receipt/parse.ts  receipt/fixtures/
  share.ts        # share-link encode/decode
  summaryText.ts  people.ts
  db.ts           # Dexie schema, ensureSeeded(), SCHEMA_VERSION   (storage seam)
  repo.ts         # THE WRITE PATH                                 (storage seam)
  hooks.ts        # THE READ PATH
  backup.ts
  sheetParam.ts  useSheetParam.ts  useModalA11y.ts  sheetDrag.ts
e2e/
  smoke.spec.ts                 # loads / and sees the heading
scripts/generate-icons.mjs      # (planned) PWA icons
```
