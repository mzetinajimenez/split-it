"use client";

// AdjustmentList: fees and discounts on the bill, each with its label, the entered amount or
// %, and the resolved cents from `split.adjustments`. Tap to edit; add buttons open the sheet.

import { Button, Money, PlusGlyph } from "@/app/components/ui";
import { formatBps, formatMoney } from "@/lib/money";
import type { Bill, SplitResult } from "@/lib/types";

export type AdjustmentTarget = { kind: "fee" | "discount"; adjustmentId?: string };

export default function AdjustmentList({
  bill,
  split,
  onOpen,
}: {
  bill: Bill;
  split: SplitResult;
  onOpen: (target: AdjustmentTarget) => void;
}) {
  const rows = bill.adjustments.filter((a) => a.kind === "fee" || a.kind === "discount");
  return (
    <section aria-label="Fees and discounts" className="flex flex-col gap-2 px-4 py-4">
      <h2 className="font-display text-lg font-bold text-ink">Fees &amp; discounts</h2>
      {rows.length > 0 ? (
        <ul className="border-y border-rule">
          {rows.map((a) => {
            const cents = split.adjustments.find((r) => r.id === a.id)?.cents ?? 0;
            const entered =
              a.value.type === "percent" ? formatBps(a.value.bps) : formatMoney(a.value.cents, bill.currency);
            return (
              <li key={a.id} className="border-b border-rule last:border-b-0">
                <button
                  type="button"
                  onClick={() => onOpen({ kind: a.kind as "fee" | "discount", adjustmentId: a.id })}
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-1 py-2 text-left active:bg-ground-deep md:hover:bg-ground-deep"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base text-ink">{a.label}</span>
                    <span className="block text-sm text-ink-muted">
                      {a.kind === "discount" ? "Discount" : "Fee"} · {entered}
                    </span>
                  </span>
                  <Money cents={cents} currency={bill.currency} signed className="text-base text-ink" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">No fees or discounts.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button icon={<PlusGlyph className="size-4" />} onClick={() => onOpen({ kind: "fee" })}>
          Add fee
        </Button>
        <Button icon={<PlusGlyph className="size-4" />} onClick={() => onOpen({ kind: "discount" })}>
          Add discount
        </Button>
      </div>
    </section>
  );
}
