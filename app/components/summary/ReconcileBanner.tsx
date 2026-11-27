import Link from "next/link";
import type { Bill, SplitResult } from "@/lib/types";
import { CheckGlyph, Money } from "../ui";

/**
 * Whether the split adds up. Prop-driven (no hooks) so the shared view (#25) can reuse it.
 * Every figure is read straight off `SplitResult`; nothing is computed here.
 */
export function ReconcileBanner({
  bill,
  split,
  readOnly = false,
  splitHref,
}: {
  bill: Bill;
  split: SplitResult;
  readOnly?: boolean;
  /** Where "Split" lives, for the unclaimed link. Omitted (or `readOnly`) renders no link. */
  splitHref?: string;
}) {
  const { currency } = bill;
  const diff = split.printed.totalDiffCents;
  const printedTotal = bill.printed.totalCents;
  const mismatch = diff !== null && diff !== 0 && printedTotal !== undefined;
  const unclaimedCount = split.unclaimed.itemIds.length;

  return (
    <div className="flex flex-col gap-2" data-testid="reconcile-banner">
      {split.status === "empty" ? (
        <p role="status" className="rounded-sm border border-rule-strong bg-raised p-3 text-sm text-ink-muted">
          Add items on the Receipt step
        </p>
      ) : split.status === "unclaimed" ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-x-3 rounded-sm border border-attention bg-raised p-3 text-sm text-ink"
        >
          <p>
            <Money cents={split.unclaimed.itemsCents} currency={currency} className="font-semibold text-attention" />{" "}
            still unclaimed ({unclaimedCount} {unclaimedCount === 1 ? "item" : "items"}). Totals are so far.
          </p>
          {!readOnly && splitHref ? (
            <Link
              href={splitHref}
              className="inline-flex min-h-11 items-center font-medium text-accent-deep underline underline-offset-2"
            >
              Go to Split
            </Link>
          ) : null}
        </div>
      ) : (
        <p
          role="status"
          className="flex items-center gap-2 rounded-sm border border-accent bg-raised p-3 text-sm text-ink"
        >
          <CheckGlyph className="size-5 text-accent-deep" />
          <span>
            Everyone&rsquo;s share adds up to <Money cents={split.grandTotalCents} currency={currency} className="font-semibold" />
          </span>
        </p>
      )}
      {mismatch ? (
        <p role="alert" className="rounded-sm border border-attention bg-raised p-3 text-sm text-ink">
          Receipt total before tip is <Money cents={printedTotal} currency={currency} />, but your items, tax and fees
          are {diff > 0 ? "over" : "under"} that by <Money cents={Math.abs(diff)} currency={currency} />.
        </p>
      ) : null}
    </div>
  );
}
