# split-it

[![CI](https://github.com/mzetinajimenez/split-it/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mzetinajimenez/split-it/actions/workflows/ci.yml)

A mobile-first web app for splitting an itemized bill at the table, quickly and fairly.

- Design spec: [`docs/superpowers/specs/2026-11-25-split-it-design.md`](docs/superpowers/specs/2026-11-25-split-it-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-11-25-split-it-v1-plan.md`](docs/superpowers/plans/2026-11-25-split-it-v1-plan.md)
- Contributor and agent rules: [`CLAUDE.md`](CLAUDE.md)

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
| `bundle` | each route's first-load JS ≤ its gzip budget (default 150 kB), and ≤ 10 kB growth over `main` unless the owner applies `bundle-approved` ([`scripts/ci/check-bundle-budget.mjs`](scripts/ci/check-bundle-budget.mjs)) |
| `e2e` | Playwright against the production build, `mobile` + `desktop`, retries 2 |
| `deps-guard` | `package.json` dependencies unchanged unless the owner applies `deps-approved`; `npm ci` succeeds (no lockfile drift); `npm audit --audit-level=high` is clean |
| `pr-title` | conventional-commit title (`feat:` `fix:` `chore:` `docs:` `refactor:` `test:`) and `Closes #<n>` in the body |
| `codeql` | GitHub CodeQL, JavaScript/TypeScript |

A nightly job reruns the seeded property tests with a random `PROPERTY_SEED` and opens an
issue with the seed if they fail; reproduce with `PROPERTY_SEED=<seed> npm test`.
