import { notFound } from "next/navigation";
import { Suspense } from "react";
import SheetHarness from "./SheetHarness";

// E2E-only harness for the overlay port (#5): a page with one `?sheet=` host, so
// e2e/sheet.spec.ts can pin Back / Escape / cold-load behaviour before any real sheet exists.
//
// Gated out of real deployments. This page is static, so the flag is read once, at BUILD time,
// and only Playwright's webServer sets it (playwright.config.ts). Every other build — Vercel, a
// plain `npm run build` — prerenders this route as a 404. (Turbopack still emits the harness's
// client chunk into .next/static, but no page references it.) Delete this route once the first
// real sheet (#17 / #20) carries the spec.
//
// Not `dynamic = "force-static"`: that prerenders useSearchParams() as empty instead of bailing
// out to client rendering, so a cold load with `?sheet=` hits a hydration mismatch (React #418)
// and the strip never runs. The page is static by default anyway.
export default function SheetHarnessPage() {
  if (process.env.SPLIT_IT_E2E_HARNESS !== "1") notFound();
  return (
    // useSheetParam() calls useSearchParams(), which needs a Suspense boundary or `next build`
    // fails.
    <Suspense fallback={null}>
      <SheetHarness />
    </Suspense>
  );
}
