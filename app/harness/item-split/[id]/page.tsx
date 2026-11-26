import { notFound } from "next/navigation";
import { Suspense } from "react";
import ItemSplitHarness from "./ItemSplitHarness";

// E2E-only stand-in for the claim board (#19) so e2e/item-split.spec.ts can drive
// <ItemSplitSheetHost/> on a seeded bill. Gated like app/harness/sheet: only Playwright's
// webServer sets SPLIT_IT_E2E_HARNESS. Delete once #19 mounts the host on the real Split page.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.SPLIT_IT_E2E_HARNESS !== "1") notFound();
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ItemSplitHarness billId={id} />
    </Suspense>
  );
}
