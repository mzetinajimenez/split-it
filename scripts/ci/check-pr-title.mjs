#!/usr/bin/env node
// PR title/body gate (#6). Plain Node, no dependencies.
//
// The title must be a conventional commit: `<type>[(scope)][!]: <subject>` with type one of
// feat, fix, chore, docs, refactor, test. The body must contain `Closes #<n>`.
//
// Env: PR_TITLE, PR_BODY (passed via env, never interpolated into the shell).
export const TYPES = ["feat", "fix", "chore", "docs", "refactor", "test"];
const TITLE_RE = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9._/-]+\\))?!?: \\S`);
const CLOSES_RE = /\bcloses #\d+\b/i;

export function checkPr(title, body) {
  const errors = [];
  if (!TITLE_RE.test(title)) {
    errors.push(
      `PR title "${title}" is not a conventional commit. Expected "<type>: <subject>" with type one of ${TYPES.join(", ")} (an optional "(scope)" and "!" are allowed).`,
    );
  }
  if (!CLOSES_RE.test(body)) {
    errors.push('PR body must contain "Closes #<issue number>".');
  }
  return errors;
}

function main() {
  const errors = checkPr(process.env.PR_TITLE ?? "", process.env.PR_BODY ?? "");
  if (errors.length) {
    for (const e of errors) console.log(`::error::${e}`);
    process.exit(1);
  }
  console.log("PR title and body OK.");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
