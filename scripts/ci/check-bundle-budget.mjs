#!/usr/bin/env node
// Bundle budget gate (#6). Plain Node, no dependencies.
//
// Reads `.next/diagnostics/route-bundle-stats.json` (written by `next build`), gzips every
// first-load chunk of every route with Node's built-in zlib, and fails when:
//   - a route's first-load JS exceeds its budget (DEFAULT_BUDGET, or ROUTE_BUDGETS), or
//   - a route grew by more than MAX_GROWTH over the `main` baseline and the PR does not carry
//     the owner-applied `bundle-approved` label.
//
// Usage:
//   node scripts/ci/check-bundle-budget.mjs [--next-dir .next] [--baseline report.json]
//                                           [--out report.json]
// Env:
//   PR_LABELS  JSON array of label names on the PR (e.g. from toJSON(...labels.*.name)).
//
// The report written with --out is the baseline the next PR compares against (CI uploads it
// from every push to main).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const KB = 1000;
export const DEFAULT_BUDGET = 150 * KB; // gzip bytes of first-load JS per route
export const MAX_GROWTH = 10 * KB; // gzip bytes over main before `bundle-approved` is needed
// Per-route overrides, keyed by route as Next reports it (e.g. "/bills/[id]/split").
export const ROUTE_BUDGETS = {};

function parseArgs(argv) {
  const args = { nextDir: ".next", baseline: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--next-dir") args.nextDir = argv[++i];
    else if (a === "--baseline") args.baseline = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

export function measure(nextDir) {
  const statsPath = join(nextDir, "diagnostics", "route-bundle-stats.json");
  if (!existsSync(statsPath)) {
    throw new Error(`${statsPath} not found — run \`next build\` first`);
  }
  const stats = JSON.parse(readFileSync(statsPath, "utf8"));
  // Chunk paths are relative to the project root and start with ".next/".
  const projectRoot = resolve(nextDir, "..");
  const gzCache = new Map();
  const gz = (p) => {
    if (!gzCache.has(p)) {
      const abs = p.startsWith(".next/") ? join(nextDir, p.slice(".next/".length)) : join(projectRoot, p);
      gzCache.set(p, gzipSync(readFileSync(abs), { level: 9 }).length);
    }
    return gzCache.get(p);
  };
  const routes = {};
  for (const r of stats) {
    const chunks = [...new Set(r.firstLoadChunkPaths ?? [])].filter((p) => p.endsWith(".js"));
    routes[r.route] = chunks.reduce((sum, p) => sum + gz(p), 0);
  }
  return routes;
}

export function evaluate(routes, baseline, labels) {
  const approved = labels.includes("bundle-approved");
  const failures = [];
  const rows = [];
  for (const [route, bytes] of Object.entries(routes).sort()) {
    const budget = ROUTE_BUDGETS[route] ?? DEFAULT_BUDGET;
    const base = baseline?.[route];
    const delta = base === undefined ? null : bytes - base;
    rows.push({ route, bytes, budget, base, delta });
    if (bytes > budget) {
      failures.push(`${route}: ${fmt(bytes)} exceeds its ${fmt(budget)} budget`);
    }
    if (delta !== null && delta > MAX_GROWTH && !approved) {
      failures.push(
        `${route}: grew ${fmt(delta)} over main (limit ${fmt(MAX_GROWTH)}) without the bundle-approved label`,
      );
    }
  }
  return { rows, failures, approved };
}

const fmt = (b) => `${(b / KB).toFixed(1)} kB`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  const routes = measure(args.nextDir);
  let baseline = null;
  if (args.baseline && existsSync(args.baseline)) {
    baseline = JSON.parse(readFileSync(args.baseline, "utf8")).routes ?? null;
  } else if (args.baseline) {
    console.log(`::notice::No main baseline at ${args.baseline}; skipping the growth check.`);
  }
  const labels = process.env.PR_LABELS ? JSON.parse(process.env.PR_LABELS) : [];
  const { rows, failures, approved } = evaluate(routes, baseline, labels);

  const lines = [
    "| Route | First-load JS (gzip) | Budget | main | Δ |",
    "|---|---:|---:|---:|---:|",
    ...rows.map(
      (r) =>
        `| \`${r.route}\` | ${fmt(r.bytes)} | ${fmt(r.budget)} | ${r.base === undefined ? "—" : fmt(r.base)} | ${
          r.delta === null ? "—" : `${r.delta >= 0 ? "+" : ""}${fmt(r.delta)}`
        } |`,
    ),
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## Bundle budget\n\n${lines.join("\n")}\n`, { flag: "a" });
  }
  if (args.out) writeFileSync(args.out, JSON.stringify({ routes }, null, 2) + "\n");
  if (approved) console.log("bundle-approved label present: growth check waived (budgets still apply).");

  if (failures.length) {
    for (const f of failures) console.log(`::error::${f}`);
    process.exit(1);
  }
  console.log("Bundle budget OK.");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
