"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import TotalsTray from "@/app/components/split/TotalsTray";
import { Money } from "@/app/components/ui";
import { useSplit } from "@/lib/hooks";
import { toggleClaim } from "@/lib/repo";

// Stub Split step: ?bill=<id>. A header with the grand total, one "claim" button per item
// (assigns it to the active person), and the tray. Stands in for #19's ClaimBoard.
export default function TotalsTrayHarness() {
  const billId = useSearchParams().get("bill");
  const [active, setActive] = useState<string | null>(null);
  const data = useSplit(billId ?? "");

  if (!billId || !data) return <main className="p-4 text-ink">Loading…</main>;
  const { bill, split } = data;
  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="font-display text-2xl text-ink">Totals tray harness</h1>
      <p className="text-ink">
        Grand total <Money cents={split.grandTotalCents} currency={bill.currency} />
        <span data-testid="grand-total" hidden>{split.grandTotalCents}</span>
      </p>
      <ul className="mt-4 space-y-2">
        {bill.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={!active}
              onClick={() => active && toggleClaim(bill.id, item.id, active)}
              className="min-h-11 w-full rounded-sm border border-rule px-4 text-left text-ink active:bg-ground-deep disabled:opacity-50"
            >
              {item.name} · <Money cents={item.priceCents} currency={bill.currency} />
            </button>
          </li>
        ))}
      </ul>
      <TotalsTray billId={billId} activePersonId={active} onSelectPerson={setActive} />
    </main>
  );
}
