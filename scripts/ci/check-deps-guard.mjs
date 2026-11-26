#!/usr/bin/env node
// Dependency guard (#6), part 1 of 3. Plain Node, no dependencies.
//
// Fails when `dependencies` or `devDependencies` in package.json differ from the base
// branch's copy and the PR lacks the owner-applied `deps-approved` label. (Lockfile drift and
// `npm audit` are separate steps in the `deps-guard` job: `npm ci` and
// `npm audit --audit-level=high`.)
//
// Usage: node scripts/ci/check-deps-guard.mjs <base-package.json> [<head-package.json>]
// Env:   PR_LABELS  JSON array of label names on the PR.
import { readFileSync } from "node:fs";

const FIELDS = ["dependencies", "devDependencies"];

export function diffDeps(base, head) {
  const changes = [];
  for (const field of FIELDS) {
    const a = base[field] ?? {};
    const b = head[field] ?? {};
    for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(name in a)) changes.push(`${field}: added ${name}@${b[name]}`);
      else if (!(name in b)) changes.push(`${field}: removed ${name}@${a[name]}`);
      else if (a[name] !== b[name]) changes.push(`${field}: ${name} ${a[name]} -> ${b[name]}`);
    }
  }
  return changes;
}

function main() {
  const [basePath, headPath = "package.json"] = process.argv.slice(2);
  if (!basePath) {
    console.error("usage: check-deps-guard.mjs <base-package.json> [<head-package.json>]");
    process.exit(2);
  }
  const base = JSON.parse(readFileSync(basePath, "utf8"));
  const head = JSON.parse(readFileSync(headPath, "utf8"));
  const labels = process.env.PR_LABELS ? JSON.parse(process.env.PR_LABELS) : [];
  const changes = diffDeps(base, head);

  if (changes.length === 0) {
    console.log("No dependency changes.");
    return;
  }
  console.log("Dependency changes:\n" + changes.map((c) => `  - ${c}`).join("\n"));
  if (labels.includes("deps-approved")) {
    console.log("deps-approved label present: OK.");
    return;
  }
  console.log(
    "::error::package.json dependencies changed without the owner-applied `deps-approved` label. " +
      "Ask the owner before adding or changing a dependency (CLAUDE.md).",
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
