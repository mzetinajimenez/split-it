import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output.
    "playwright-report/**",
    "test-results/**",
    // Sibling worktrees under .claude/worktrees/ carry their own .next/ build output. The
    // ".next/**" entry above is anchored at the repo root, so without this a stale worktree
    // floods `npm run lint` with thousands of errors from generated code we don't own.
    ".claude/**",
  ]),
]);

export default eslintConfig;
