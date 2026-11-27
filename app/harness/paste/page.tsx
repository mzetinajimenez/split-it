import { notFound } from "next/navigation";
import { Suspense } from "react";
import PasteHarness from "./PasteHarness";

// E2E-only stand-in for the Receipt step (#16 owns the real page) so e2e/paste-receipt.spec.ts
// can drive PasteReceiptSheet. Build-time gated exactly like app/harness/sheet. Delete once
// #16's receipt page hosts the sheet.
export default function PasteHarnessPage() {
  if (process.env.SPLIT_IT_E2E_HARNESS !== "1") notFound();
  return (
    <Suspense fallback={null}>
      <PasteHarness />
    </Suspense>
  );
}
