import type { Bill, SplitResult } from "@/lib/types";
import { payerOwedCents } from "@/lib/payerOwed";
import { Money } from "../ui";

/**
 * Who paid, and what they're owed; or an inline "Who paid?" picker. Prop-driven: the page
 * passes `onSetPayer` (a `repo.setPayer` wrapper). `readOnly` hides the picker.
 */
export function PayerLine({
  bill,
  split,
  readOnly = false,
  onSetPayer,
}: {
  bill: Bill;
  split: SplitResult;
  readOnly?: boolean;
  onSetPayer?: (personId: string | null) => void;
}) {
  const payer = bill.people.find((p) => p.id === bill.paidBy);
  if (bill.people.length === 0) return null;

  if (!payer) {
    if (readOnly) return null;
    return (
      <div role="group" aria-label="Who paid?" className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ink">Who paid?</p>
        <div className="flex flex-wrap gap-2">
          {bill.people.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSetPayer?.(p.id)}
              className="min-h-11 rounded-sm border border-rule-strong bg-raised px-4 text-sm font-medium text-ink active:bg-ground-deep md:hover:bg-ground-deep"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 text-sm text-ink" data-testid="payer-line">
      <p>
        <span className="font-semibold">{payer.name}</span> paid{" "}
        <Money cents={split.grandTotalCents} currency={bill.currency} /> &mdash; is owed{" "}
        <Money cents={payerOwedCents(split, payer.id)} currency={bill.currency} className="font-semibold" />
      </p>
      {!readOnly ? (
        <button
          type="button"
          onClick={() => onSetPayer?.(null)}
          className="inline-flex min-h-11 items-center text-ink-muted underline underline-offset-2"
        >
          Change
        </button>
      ) : null}
    </div>
  );
}
