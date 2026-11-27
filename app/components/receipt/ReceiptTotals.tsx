"use client";

// ReceiptTotals (spec §8 "Receipt"): tax (amount or %), the printed subtotal and printed total,
// and a live mismatch banner driven by `split.printed`. No money math here: text goes through
// parseMoney / parsePercent, results come from computeSplit via useSplit and render via <Money>.
// The mismatch is a warning (attention), never an error. @/lib/repo is a lazy chunk.

import { useEffect, useState } from "react";
import { toast } from "@/app/components/Toast";
import { Field, Money, MoneyInput, SegmentedControl } from "@/app/components/ui";
import { formatBps, formatMoney, parseMoney, parsePercent } from "@/lib/money";
import type { AmountSpec, Bill, SplitResult } from "@/lib/types";

type Mode = "amount" | "percent";

function specText(spec: AmountSpec | undefined, currency: string): string {
  if (!spec) return "";
  return spec.type === "percent"
    ? formatBps(spec.bps).replace("%", "")
    : formatMoney(spec.cents, currency).replace(/[^\d.]/g, "");
}

const moneyText = (cents: number | undefined, currency: string) =>
  cents === undefined ? "" : formatMoney(cents, currency).replace(/[^\d.]/g, "");

export default function ReceiptTotals({ bill, split }: { bill: Bill; split: SplitResult }) {
  const { currency } = bill;
  const taxSpec = bill.adjustments.find((a) => a.kind === "tax")?.value;
  const taxKey = taxSpec ? JSON.stringify(taxSpec) : "none";
  const printedKey = `${bill.printed.subtotalCents ?? ""}|${bill.printed.totalCents ?? ""}`;

  useEffect(() => {
    void import("@/lib/repo");
  }, []);

  const { subtotalDiffCents: subDiff, totalDiffCents: totDiff } = split.printed;
  const printedSub = bill.printed.subtotalCents;
  const printedTot = bill.printed.totalCents;

  return (
    <section aria-label="Receipt totals" className="flex flex-col gap-4 px-4 py-5">
      <h2 className="font-display text-lg font-bold text-ink">Receipt totals</h2>

      <TaxField key={taxKey} billId={bill.id} currency={currency} spec={taxSpec} />
      <PrintedFields key={printedKey} bill={bill} />

      {subDiff !== null && subDiff !== 0 && printedSub !== undefined ? (
        <Banner testId="printed-mismatch-subtotal">
          Items add up to <Money cents={split.itemsSubtotalCents} currency={currency} /> — receipt says{" "}
          <Money cents={printedSub} currency={currency} />
        </Banner>
      ) : null}
      {totDiff !== null && totDiff !== 0 && printedTot !== undefined ? (
        <Banner testId="printed-mismatch-total">
          Total before tip is off by <Money cents={totDiff} currency={currency} signed /> — receipt says{" "}
          <Money cents={printedTot} currency={currency} />
        </Banner>
      ) : null}
    </section>
  );
}

function Banner({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <p
      role="status"
      data-testid={testId}
      className="rounded-sm border border-attention bg-raised px-3 py-2.5 text-sm text-ink"
    >
      <span className="font-semibold text-attention">Doesn’t match. </span>
      {children}
    </p>
  );
}

function TaxField({
  billId,
  currency,
  spec,
}: {
  billId: string;
  currency: string;
  spec: AmountSpec | undefined;
}) {
  const [mode, setMode] = useState<Mode>(spec?.type ?? "amount");
  const [text, setText] = useState(() => specText(spec, currency));
  const [error, setError] = useState<string | null>(null);

  async function commit(nextMode: Mode, value: string) {
    const trimmed = value.trim();
    let next: AmountSpec | null;
    if (trimmed === "") next = null;
    else if (nextMode === "percent") {
      const bps = parsePercent(trimmed);
      if (bps === null) return setError("Enter a percentage like 8.88 (up to 2 decimals)");
      next = { type: "percent", bps };
    } else {
      const cents = parseMoney(trimmed, currency);
      if (cents === null) return setError("Enter a valid amount");
      next = { type: "amount", cents };
    }
    setError(null);
    try {
      const { setTax } = await import("@/lib/repo");
      await setTax(billId, next);
    } catch {
      toast("Couldn’t save the tax", true);
    }
  }

  return (
    <Field label="Tax" error={error ?? undefined}>
      {({ id, describedBy, invalid }) => (
        <div className="flex items-start gap-2">
          <SegmentedControl<Mode>
            label="Tax type"
            value={mode}
            onChange={(m) => {
              setMode(m);
              if (text.trim() !== "") void commit(m, text);
            }}
            options={[
              { value: "amount", label: currency === "USD" ? "$" : currency },
              { value: "percent", label: "%" },
            ]}
          />
          <MoneyInput
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            placeholder={mode === "percent" ? "8.88" : "0.00"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => void commit(mode, text)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit(mode, text);
              }
            }}
            className="min-w-0"
          />
        </div>
      )}
    </Field>
  );
}

function PrintedFields({ bill }: { bill: Bill }) {
  const { currency } = bill;
  const [sub, setSub] = useState(() => moneyText(bill.printed.subtotalCents, currency));
  const [tot, setTot] = useState(() => moneyText(bill.printed.totalCents, currency));
  const [errors, setErrors] = useState<{ sub?: string; tot?: string }>({});

  async function commit(which: "sub" | "tot", value: string) {
    const trimmed = value.trim();
    const cents = trimmed === "" ? undefined : parseMoney(trimmed, currency);
    if (cents === null) {
      setErrors((e) => ({ ...e, [which]: "Enter a valid amount" }));
      return;
    }
    setErrors((e) => ({ ...e, [which]: undefined }));
    const printed = { ...bill.printed };
    const key = which === "sub" ? "subtotalCents" : "totalCents";
    if (cents === undefined) delete printed[key];
    else printed[key] = cents;
    try {
      const { updateBill } = await import("@/lib/repo");
      await updateBill(bill.id, { printed });
    } catch {
      toast("Couldn’t save the printed total", true);
    }
  }

  const field = (
    which: "sub" | "tot",
    label: string,
    value: string,
    set: (v: string) => void,
  ) => (
    <Field label={label} error={errors[which]}>
      {({ id, describedBy, invalid }) => (
        <MoneyInput
          id={id}
          aria-describedby={describedBy}
          invalid={invalid}
          placeholder="Optional"
          value={value}
          onChange={(e) => set(e.target.value)}
          onBlur={() => void commit(which, value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit(which, value);
            }
          }}
        />
      )}
    </Field>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {field("sub", "Printed subtotal", sub, setSub)}
      {field("tot", "Printed total (before tip)", tot, setTot)}
    </div>
  );
}

