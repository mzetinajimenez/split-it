# split-it

A mobile-first web app for splitting an itemized bill at the table, quickly and fairly.

- Production: <https://split-it-peach.vercel.app> (deploys from `main`; every PR gets a Vercel preview URL)

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
