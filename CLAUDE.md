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

## Workflow rules

- **One branch and one PR per issue.** Work happens on `issue-<n>-<slug>` branches cut from
  `main`, with small PRs against `main`; the swarm coordinator merges (workers never merge,
  push to `main` or force-push). Conventional-commit messages (`feat:`, `fix:`, `docs:`,
  `chore:`, `test:`, `refactor:`), in logical chunks. Stage explicit paths — never
  `git add -A`. Touch only the files your issue owns, plus the plan's pre-agreed shared
  touch points.
- **Green before every commit.** `npm run lint && npm run typecheck && npm test && npm run
  build && npm run test:e2e` must all pass. Never skip, disable or weaken a test to get
  green. The e2e suite builds and serves a production bundle across two viewport projects,
  so it is slower than the rest — run it before pushing, not on every save.
  The same gate runs in CI (`.github/workflows/ci.yml`, #6) as separate required checks:
  `lint` (`--max-warnings 0`), `typecheck`, `unit`, `build`, `bundle` (first-load JS budget
  and ≤10 kB growth over `main` without `bundle-approved`), `e2e` (mobile + desktop),
  `deps-guard` (dependency changes need `deps-approved`; `npm ci` and
  `npm audit --audit-level=high` must pass), `pr-title` (conventional title + `Closes #<n>`)
  and `codeql`. A PR merges only when all of them are green.
- **Ask before adding dependencies.** The dependency set is deliberately tiny: `dexie`,
  `dexie-react-hooks`, `next`, `react`, `react-dom`, `zod`; dev: `typescript`, `@types/*`,
  `tailwindcss`, `@tailwindcss/postcss`, `eslint`, `eslint-config-next`, `vitest`,
  `fake-indexeddb`, `@playwright/test` (versions in `package.json`). Do not add an npm
  package without asking first — prefer a built-in or a few lines of local code (the PWA
  icons, for example, are generated with Node's built-in `zlib`; the property tests use a
  hand-rolled PRNG). A PR that adds a dependency needs the owner's `deps-approved` label.
- **IndexedDB migrations are additive-only, NEVER destructive.** The Dexie schema is
  versioned in `lib/db.ts`. A schema change adds a **new** `db.version(N)` block (and bumps
  `SCHEMA_VERSION`); it never edits the existing `version(1)` block, drops a table, or
  removes an index. Users' data lives in their browser — a destructive migration silently
  eats it. Bills are deleted by tombstone (`deletedAt`), never by row removal.
- **Any "clear all data" path clears and re-seeds `meta` + `settings` together.**
  `ensureSeeded` keys "first run" off the singleton `meta` row and creates the default
  `settings` row with it; deleting data without deleting `meta` leaves the app un-seedable,
  and deleting `meta` without re-seeding leaves it settings-less (spec §4, §8 Settings).

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

- **Read through hooks, write through repo.** UI uses `use*` hooks from `lib/hooks.ts` to
  read and `lib/repo.ts` functions to write. Never import Dexie (or `@/lib/db`) in a
  component.
- Splits are **derived at render** (`computeSplit(bill)`) and never stored.
- **Framework-free `lib/`.** Keep `lib/` (money, split, parse, share, backup, and the query
  functions in `lib/hooks.ts`) free of React/DOM so it stays unit-testable with
  fake-indexeddb. New data/logic gets a Vitest test alongside it. Components get no jsdom
  tests; Playwright covers the browser layer.

### Money (split-it specific)

- **Integer minor units everywhere.** No floats on money, ever. Only `lib/money.ts` parses
  and formats, and only `lib/split.ts` allocates. Components never add, multiply or round
  amounts; they render `SplitResult` values through `formatMoney`.
- **Totals always reconcile.** `Σ people + unclaimed === grand total` is a tested
  invariant. Any change to the engine keeps it.
- **Nothing is auto-assigned.** Unclaimed stays unclaimed until a person taps or chooses
  "split the rest".
- **Parsed and scanned items are never committed without review** (`DraftReview`).

### Theme

- **split-it tokens only.** Colors, fonts, and radii come from the `@theme` tokens in
  `app/globals.css`, using the semantic names fixed in spec §8: `ground`, `ground-deep`,
  `raised`, `rule`, `rule-strong`, `ink`, `ink-muted`, `accent`, `accent-deep`,
  `on-accent`, `attention`, `danger`, `danger-deep`, `person-0`…`person-7`, `on-person`,
  `font-display`, `font-body`, `font-mono`. *(Palette values pending #4.)* No raw hex or
  off-palette Tailwind colors in components — a ported `theme-contract.test.ts` enforces
  this and fails the build if a raw hex or an unknown token appears in `app/`.
- **Accent is yes, danger is careful.** `accent` means primary action and active state.
  `danger` means destructive and error, and **nothing else**. **Unclaimed is `attention`,
  not `danger`** — an unclaimed item needs action, it isn't an error.
- **Contrast is a property of the pair, not the token.** A token that is text-legal on one
  surface can fail AA on another; with an opacity modifier, compute the alpha-composited
  ratio. Never pair a token with a surface without checking.
- **Text on an accent fill is `on-accent`, never `text-white`**; text on a person colour is
  `on-person`. Money values use `font-mono` tabular figures.

### UI

- **Overlays use `Sheet` + `useModalA11y`.** Any modal/sheet renders inside
  `app/components/Sheet.tsx` (which wires `useModalA11y` for focus trap, Escape, and body
  scroll-lock). Sheets mount/unmount rather than toggling an `open` prop.
- **Sheet open/closed state lives in `?sheet=<name>`, never in `useState`.** A sheet mounts
  when the param is present, so the Android back gesture and the browser Back button close
  it with no popstate listener of our own. Open with the **patched global**
  `window.history.pushState` (never a captured reference, never before mount — an entry
  missing Next's `__NA` marker causes a full page reload on Back). `useSheetParam` tracks
  per instance, in a ref, whether *it* was the one that pushed: if so, close with
  `window.history.back()`, so the entry is consumed and the stack stays balanced; if the
  param arrived on the URL some other way (cold load before the strip runs, a client-side
  nav that lands with `?sheet=` already set), close by `router.replace`-ing the param-free
  URL instead, so closing never traverses an entry this instance didn't push. The param is
  ephemeral and stripped once on cold load via the **patched global**
  `window.history.replaceState` (synced into `useSearchParams()` since Next 14.1), **not**
  `router.replace`: on a statically prerendered page the router's initial URL has no search,
  so `router.replace` to the bare path is a silent no-op and the sheet stays open (#5;
  pinned by `e2e/sheet.spec.ts`). **Never put an entity id in the query** — the
  owning route already carries it in the path (e.g. `/bills/[id]/split?sheet=split-item`); a
  second id (which item or person a sheet is for, a prefill payload) stays in local state.
  Any component calling `useSheetParam` must sit inside a `<Suspense>` boundary or
  `next build` fails. A delete-then-navigate path never calls `closeSheet()`:
  `history.back()` queues a traversal that resolves against the history index at the time
  the queue drains, not when it was called, so a synchronous `router.replace` right after
  it would land first and the deferred `back()` would then resolve against the
  post-navigation index — landing on `?sheet=…` for an entity that no longer exists.
  Navigate with `router.replace` (not `push`, which would stack a new entry instead of
  consuming the `?sheet=` one) and let the sheet unmount with the route.
- **Desktop (≥`md`) gets a left nav rail, not a wider phone layout.** `BottomNav`
  (`md:hidden`) and `NavRail` (`hidden md:flex`) under `app/components/nav/` share one tab
  list so the two surfaces can't list a different set of tabs (#11). Content is padded
  past the rail and constrained to a reading column, set once in the root layout, not
  per-route. Sheets stay centered modals at ≥`sm`, unchanged by the rail.
- **Hover states are `md:hover:`, never bare `hover:`.** Gated to `md` so a touch tap (which
  fires `:hover` on many mobile browsers with no way to un-hover) never gets stuck showing
  a hover treatment meant for a mouse. Each control's hover class reuses a token already in
  the app's press/hover vocabulary — typically the same token as the element's own
  `active:` variant.
- **Destructive confirms use `ConfirmBox`.** Inline `role="alertdialog"` with a focus move —
  not a stacked sheet, and not a bare `danger` div.
- **Toast on failed writes.** Wrap repo writes in the UI and `toast(...)` on rejection so a
  failed save is never silent.
- **Mobile-first, ≥44px touch targets.** Safe-area insets on fixed chrome, `h-dvh`
  overlays, `active:` press states, and a minimum 44px hit area on interactive controls
  (tap area can exceed the visual size). Text-entry inputs are ≥16px (`text-base`) so iOS
  doesn't focus-zoom (`inputMode="decimal"` for money); pinch-zoom is intentionally left
  enabled (WCAG 1.4.4).
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
