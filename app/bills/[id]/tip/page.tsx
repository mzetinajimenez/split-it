"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdjustmentList, { type AdjustmentTarget } from "@/app/components/tip/AdjustmentList";
import AdjustmentSheet from "@/app/components/tip/AdjustmentSheet";
import TipPicker from "@/app/components/tip/TipPicker";
import { Money } from "@/app/components/ui";
import { useSplit } from "@/lib/hooks";
import { useSheetParam } from "@/lib/useSheetParam";

export default function TipPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <TipStep billId={id} />
    </Suspense>
  );
}

function TipStep({ billId }: { billId: string }) {
  const data = useSplit(billId);
  const { open, openSheet, closeSheet } = useSheetParam("adjustment");
  const [target, setTarget] = useState<AdjustmentTarget | null>(null);

  // Prefetch the write path so the first tap doesn't wait on the chunk.
  useEffect(() => {
    void import("@/lib/repo");
  }, []);

  if (!data) return <main aria-busy className="min-h-dvh" />;
  const { bill, split } = data;
  const taxCents = split.adjustments.find((a) => a.kind === "tax")?.cents;

  return (
    <main className="pb-40">
      <TipPicker key={bill.id} bill={bill} split={split} />
      <AdjustmentList
        bill={bill}
        split={split}
        onOpen={(t) => {
          setTarget(t);
          openSheet();
        }}
      />
      <section aria-label="Tax" className="flex items-center justify-between gap-3 px-4 py-4">
        <p className="text-base text-ink">
          Tax{" "}
          {taxCents === undefined ? (
            <span className="text-ink-muted">not entered</span>
          ) : (
            <Money cents={taxCents} currency={bill.currency} />
          )}
        </p>
        <Link
          href={`/bills/${billId}/receipt`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-deep underline"
        >
          Edit on Receipt
        </Link>
      </section>
      {open && target ? <AdjustmentSheet key={target.adjustmentId ?? target.kind} bill={bill} target={target} onClose={closeSheet} /> : null}
    </main>
  );
}
