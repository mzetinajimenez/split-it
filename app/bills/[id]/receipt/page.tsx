"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ItemRow from "@/app/components/receipt/ItemRow";
import ItemSheet from "@/app/components/receipt/ItemSheet";
import PasteReceiptSheet from "@/app/components/receipt/PasteReceiptSheet";
import QuickAddRow from "@/app/components/receipt/QuickAddRow";
import ReceiptTotals from "@/app/components/receipt/ReceiptTotals";
import { ReceiptGlyph } from "@/app/components/ui";
import { useSplit } from "@/lib/hooks";
import { useSheetParam } from "@/lib/useSheetParam";

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <ReceiptStep billId={id} />
    </Suspense>
  );
}

function ReceiptStep({ billId }: { billId: string }) {
  const data = useSplit(billId);
  const { open, openSheet, closeSheet } = useSheetParam("item");
  const [itemId, setItemId] = useState<string | null>(null);

  // Prefetch the write path so the first add doesn't wait on the chunk.
  useEffect(() => {
    void import("@/lib/repo");
  }, []);

  if (!data) return <main aria-busy className="min-h-dvh" />;
  const { bill, split } = data;
  const item = open ? bill.items.find((it) => it.id === itemId) : undefined;

  return (
    <main className="pb-40">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="font-display text-xl font-bold text-ink">Receipt</h2>
        <PasteReceiptSheet billId={billId} />
      </div>

      {bill.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-ink-muted">
          <ReceiptGlyph className="size-10" />
          <p>Add each line from the receipt below, or paste the whole thing.</p>
        </div>
      ) : (
        <ul aria-label="Items" className="border-t border-rule">
          {bill.items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              currency={bill.currency}
              onOpen={(itemId) => {
                setItemId(itemId);
                openSheet();
              }}
            />
          ))}
        </ul>
      )}

      <QuickAddRow billId={billId} currency={bill.currency} />
      <ReceiptTotals bill={bill} split={split} />
      {item ? <ItemSheet key={item.id} bill={bill} item={item} onClose={closeSheet} /> : null}
    </main>
  );
}
