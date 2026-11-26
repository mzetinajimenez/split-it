import { notFound } from "next/navigation";
import { Suspense } from "react";
import TotalsTrayHarness from "./TotalsTrayHarness";

// E2E-only harness for #21 (see app/harness/sheet/page.tsx for the gating rationale): mounts
// <TotalsTray/> on a stub Split step until #19 owns the real route. Delete once #19 lands.
export default function TotalsTrayHarnessPage() {
  if (process.env.SPLIT_IT_E2E_HARNESS !== "1") notFound();
  return (
    <Suspense fallback={null}>
      <TotalsTrayHarness />
    </Suspense>
  );
}
