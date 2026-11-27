# split-it

[![CI](https://github.com/mzetinajimenez/split-it/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mzetinajimenez/split-it/actions/workflows/ci.yml)

A mobile-first web app for splitting an itemized bill at the table, quickly and fairly.

- Production: <https://split-it-peach.vercel.app> (deploys from `main`; every PR gets a Vercel preview URL)

- Design spec: [`docs/superpowers/specs/2026-11-25-split-it-design.md`](docs/superpowers/specs/2026-11-25-split-it-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-11-25-split-it-v1-plan.md`](docs/superpowers/plans/2026-11-25-split-it-v1-plan.md)
- Contributor and agent rules: [`CLAUDE.md`](CLAUDE.md)

## Features

- Type or paste an itemized receipt, review the parsed lines, and add the people at the table.
- Everyone taps the items they had; shared items split evenly or by weight, and nothing is
  assigned automatically.
- Tax, tip (pre- or post-tax) and fees are shared proportionally; totals always reconcile to
  the cent.
- A per-person summary, plus share as text or as a read-only link.
- Installable to the home screen (PWA manifest and icons). There is no service worker in v1,
  so the app itself needs a connection to load.
- Backup export/import and "clear all data" in Settings.

## Stack

Next.js (App Router) + React, TypeScript, Tailwind CSS v4, Dexie (IndexedDB) for storage, zod
for validation. No backend. Deployed on Vercel. Full rules in [`CLAUDE.md`](CLAUDE.md).

## Privacy

- **Your bills live only on this device.** They are stored in your browser's IndexedDB and
  are never sent to a server. Clearing site data, or switching browsers or devices, loses
  them, so use Settings → Backup to export a copy.
- **Share links carry the bill in the URL fragment** (`#…`). The fragment is never sent to
  the server, but anyone who has the link can read the bill, so share it only with the people
  at the table.

## Install as an app

Open the production site on your phone, then use *Add to Home Screen* (iPhone Safari: Share →
Add to Home Screen; Android Chrome: menu → Install app). Icons are generated with
`node scripts/generate-icons.mjs` (Node's built-in `zlib`, no dependencies) into `public/`.

## Deploy

Pushes to `main` deploy to Vercel automatically; each PR gets a preview URL. The project needs
no environment variables and `next.config.mjs` is empty.

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
```

## Check

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

`npm run test:e2e` builds the app and serves it on port 3100, then runs Playwright in the
`mobile` (Pixel 7) and `desktop` projects. Run `npx playwright install chromium` once first.

## What CI enforces

Every PR against `main` must pass these checks (each is a separate required status):

| Check | Enforces |
|---|---|
| `lint` | `npm run lint -- --max-warnings 0` |
| `typecheck` | `tsc --noEmit` |
| `unit` | Vitest over `lib/**/*.test.ts`, including the theme and storage-seam contract tests |
| `build` | `next build` succeeds |
| `bundle` | each route's first-load JS ≤ its gzip budget (default 200 kB), and ≤ 10 kB growth over `main` unless the owner applies `bundle-approved` ([`scripts/ci/check-bundle-budget.mjs`](scripts/ci/check-bundle-budget.mjs)) |
| `e2e` | Playwright against the production build, `mobile` + `desktop`, retries 2 |
| `deps-guard` | `package.json` dependencies unchanged unless the owner applies `deps-approved`; `npm ci` succeeds (no lockfile drift); `npm audit --audit-level=high` is clean |
| `pr-title` | conventional-commit title (`feat:` `fix:` `chore:` `docs:` `refactor:` `test:`) and `Closes #<n>` in the body |
| `codeql` | GitHub CodeQL, JavaScript/TypeScript |

A nightly job reruns the seeded property tests with a random `PROPERTY_SEED` and opens an
issue with the seed if they fail; reproduce with `PROPERTY_SEED=<seed> npm test`.
