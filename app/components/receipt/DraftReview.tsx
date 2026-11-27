"use client";

// DraftReview — the review step between a parsed receipt and the bill (spec §6: parsed and
// scanned items are never committed without review). Reusable: it takes a ParsedReceipt and
// reports the user's confirmed choices through onConfirm. It has no paste-specific coupling,
// so the photo scan (#29) feeds the same component. It writes nothing itself.
//
// Negative draft lines (discounts like "Happy hour -3.00") can't be items (Item.priceCents
// is ≥ 0), so they are surfaced as discount rows and reported in `totals.discounts`; the
// host turns them into `discount` adjustments.

import { useId, useState } from "react";
import { Button, CheckGlyph, Money, MoneyInput, TextInput } from "@/app/components/ui";
import { MAX_ITEM_NAME, MAX_LABEL, MAX_QUANTITY } from "@/lib/schemas";
import { formatMoney, parseMoney } from "@/lib/money";
import type { Cents, ItemInput, ParsedReceipt } from "@/lib/types";

/** What the user chose to apply besides the items. Every field is absent unless applied. */
export interface DraftTotals {
  taxCents?: Cents;
  tipCents?: Cents;
  /** As printed on the receipt, for reconciliation only. */
  printed: { subtotalCents?: Cents; totalCents?: Cents };
  /** Checked negative lines, as positive magnitudes. */
  discounts: { label: string; cents: Cents }[];
}

interface Row {
  key: number;
  checked: boolean;
  name: string;
  quantity: string;
  price: string;
  low: boolean;
  discount: boolean;
}

function cx(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <span className="grid size-11 shrink-0 place-items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="size-5 accent-accent"
      />
    </span>
  );
}

export default function DraftReview({
  parsed,
  currency = "USD",
  onConfirm,
  busy = false,
}: {
  parsed: ParsedReceipt;
  currency?: string;
  onConfirm: (items: ItemInput[], totals: DraftTotals) => void;
  busy?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    parsed.items.map((d, key) => {
      const discount = d.priceCents < 0;
      const low = d.confidence === "low";
      return {
        key,
        checked: !low,
        name: d.name,
        quantity: String(d.quantity),
        price: formatMoney(Math.abs(d.priceCents), currency).replace(/[^\d.,]/g, ""),
        low,
        discount,
      };
    }),
  );
  const [attempted, setAttempted] = useState(false);
  const detected = parsed.totals;
  const [apply, setApply] = useState({
    tax: true,
    subtotal: true,
    total: true,
    tip: false, // the Tip step owns the tip
  });
  const listId = useId();

  function patch(key: number, change: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  function validate(r: Row): { ok: true; cents: Cents; quantity: number } | { ok: false; error: string } {
    const name = r.name.trim();
    if (name === "") return { ok: false, error: "Add a name" };
    const cents = parseMoney(r.price, currency);
    if (cents === null) return { ok: false, error: "Enter a price" };
    const quantity = Number(r.quantity);
    if (!/^\d+$/.test(r.quantity.trim()) || quantity < 1 || quantity > MAX_QUANTITY) {
      return { ok: false, error: `Quantity 1–${MAX_QUANTITY}` };
    }
    return { ok: true, cents, quantity };
  }

  const picked = rows.filter((r) => r.checked);
  const itemCount = picked.filter((r) => !r.discount).length;
  const discountCount = picked.length - itemCount;
  const hasInvalid = picked.some((r) => !validate(r).ok);

  function confirm() {
    setAttempted(true);
    if (hasInvalid || picked.length === 0) return;
    const items: ItemInput[] = [];
    const discounts: DraftTotals["discounts"] = [];
    for (const r of picked) {
      const v = validate(r);
      if (!v.ok) return;
      if (r.discount) discounts.push({ label: r.name.trim().slice(0, MAX_LABEL), cents: v.cents });
      else items.push({ name: r.name.trim().slice(0, MAX_ITEM_NAME), quantity: v.quantity, priceCents: v.cents });
    }
    const totals: DraftTotals = { printed: {}, discounts };
    if (apply.tax && detected.taxCents !== undefined) totals.taxCents = detected.taxCents;
    if (apply.tip && detected.tipCents !== undefined) totals.tipCents = detected.tipCents;
    if (apply.subtotal && detected.subtotalCents !== undefined) totals.printed.subtotalCents = detected.subtotalCents;
    if (apply.total && detected.totalCents !== undefined) totals.printed.totalCents = detected.totalCents;
    onConfirm(items, totals);
  }

  const detectedRows = (
    [
      ["tax", "Tax", detected.taxCents],
      ["subtotal", "Subtotal", detected.subtotalCents],
      ["total", "Total", detected.totalCents],
      ["tip", "Tip", detected.tipCents],
    ] as const
  ).filter(([, , cents]) => cents !== undefined);

  const addLabel =
    itemCount === 0 && discountCount === 0
      ? "Nothing selected"
      : `Add ${itemCount} ${itemCount === 1 ? "item" : "items"}`;

  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 ? (
        <p className="rounded-sm bg-ground-deep p-3 text-sm text-ink">
          No items found. Check the lines below, or try pasting again.
        </p>
      ) : (
        <ul aria-label="Parsed items" className="flex flex-col divide-y divide-rule">
          {rows.map((r, i) => {
            const v = validate(r);
            const error = attempted && r.checked && !v.ok ? v.error : undefined;
            return (
              <li key={r.key} className={cx("flex items-start gap-1 py-2", !r.checked && "opacity-60")}>
                <Check
                  checked={r.checked}
                  onChange={(checked) => patch(r.key, { checked })}
                  label={`Include ${r.name || `row ${i + 1}`}`}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <TextInput
                    aria-label={`Name, row ${i + 1}`}
                    value={r.name}
                    maxLength={MAX_ITEM_NAME}
                    invalid={error !== undefined && r.name.trim() === ""}
                    onChange={(e) => patch(r.key, { name: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    {r.discount ? (
                      <span className="flex min-h-11 w-20 shrink-0 items-center text-sm font-medium text-ink">Discount</span>
                    ) : (
                      <div className="w-20 shrink-0">
                        <TextInput
                          aria-label={`Quantity, row ${i + 1}`}
                          inputMode="numeric"
                          value={r.quantity}
                          className="px-1 text-center"
                          onChange={(e) => patch(r.key, { quantity: e.target.value })}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <MoneyInput
                        aria-label={`${r.discount ? "Discount amount" : "Price"}, row ${i + 1}`}
                        value={r.price}
                        invalid={error !== undefined && parseMoney(r.price, currency) === null}
                        onChange={(e) => patch(r.key, { price: e.target.value })}
                      />
                    </div>
                  </div>
                  {r.low ? (
                    <p className="text-sm font-medium text-attention">
                      Not sure about this line. Check it before adding.
                    </p>
                  ) : null}
                  {error ? <p className="text-sm text-danger">{error}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {detectedRows.length > 0 ? (
        <fieldset className="rounded-sm border border-rule p-3">
          <legend className="px-1 text-sm font-medium text-ink">Detected</legend>
          <p className="sr-only" id={`${listId}-d`}>
            Choose which detected totals to apply to the bill.
          </p>
          <ul className="flex flex-col" aria-describedby={`${listId}-d`}>
            {detectedRows.map(([key, label, cents]) => (
              <li key={key} className="flex items-center gap-1">
                <Check
                  checked={apply[key]}
                  onChange={(checked) => setApply((a) => ({ ...a, [key]: checked }))}
                  label={`Apply ${label.toLowerCase()}`}
                />
                <span className="flex-1 text-sm text-ink">{label}</span>
                {key === "tip" ? <span className="mr-2 text-sm text-ink-muted">set in Tip step</span> : null}
                <Money cents={cents!} currency={currency} className="text-sm text-ink" />
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      {parsed.ignored.length > 0 ? (
        <details className="rounded-sm border border-rule px-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-ink">
            {parsed.ignored.length} {parsed.ignored.length === 1 ? "line" : "lines"} ignored
          </summary>
          <ul className="flex flex-col gap-1 pb-3">
            {parsed.ignored.map((l) => (
              <li key={l.line} className="flex gap-2 font-mono text-xs text-ink-muted">
                <span className="w-6 shrink-0 text-right">{l.line}</span>
                <span className="min-w-0 break-words whitespace-pre-wrap">{l.text}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="sticky bottom-0 -mx-5 bg-raised px-5 pt-2 pb-1">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={busy || picked.length === 0}
          icon={<CheckGlyph />}
          onClick={confirm}
        >
          {addLabel}
        </Button>
        {attempted && hasInvalid ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            Fix the highlighted rows, or untick them.
          </p>
        ) : null}
      </div>
    </div>
  );
}

