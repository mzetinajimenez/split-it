"use client";

import ItemSplitSheetHost, { openItemSplit } from "@/app/components/split/ItemSplitSheetHost";
import { Toaster } from "@/app/components/Toast";
import { useBill } from "@/lib/hooks";
import { useStripSheetParamOnLoad } from "@/lib/useSheetParam";

export default function ItemSplitHarness({ billId }: { billId: string }) {
  useStripSheetParamOnLoad();
  const bill = useBill(billId);
  return (
    <main className="p-4">
      <h1 className="font-display text-2xl text-ink">Item split harness</h1>
      <ul className="mt-4 space-y-2">
        {bill?.items.map((it) => (
          <li key={it.id} className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => openItemSplit(it.id)}
              className="min-h-11 rounded-sm border border-rule px-4 text-ink active:bg-ground-deep md:hover:bg-ground-deep"
            >
              Split {it.name}
            </button>
            <span className="font-mono text-sm text-ink-muted" data-testid={`claims-${it.name}`}>
              {JSON.stringify(
                Object.fromEntries(Object.entries(it.claims).map(([pid, n]) => [bill.people.find((p) => p.id === pid)?.name, n])),
              )}
            </span>
          </li>
        ))}
      </ul>
      <ItemSplitSheetHost billId={billId} />
      <Toaster />
    </main>
  );
}
