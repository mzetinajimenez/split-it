"use client";

// TipPicker (spec §8 "Tip"): one-tap tip percentages, default 20% pre-tax proportional.
// The amount shown is `split.adjustments` as-is; no money math here. Text goes through
// parsePercent at the edge. @/lib/repo is a lazy chunk (prefetched by the page).

import { useState } from "react";
import { toast } from "@/app/components/Toast";
import { Chip, Field, Money, MoneyInput } from "@/app/components/ui";
import SplitMethodSelect, { type TipMethod } from "./SplitMethodSelect";
import { formatBps, formatMoney, parseMoney, parsePercent } from "@/lib/money";
import type { Bill, SplitMode, SplitResult, AmountSpec } from "@/lib/types";

const PRESETS = [0, 1500, 1800, 2000, 2200] as const;

type TipSpec = { value: AmountSpec; basis: "pretax" | "posttax"; split: SplitMode };

/** The one place a tip struct is built: a value plus how it is based and shared. */
export function buildTipSpec(
  value: AmountSpec | number,
  basis: "pretax" | "posttax" = "pretax",
  split: SplitMode = "proportional",
): TipSpec {
  return { value: typeof value === "number" ? { type: "percent", bps: value } : value, basis, split };
}

function methodOf(tip: Bill["adjustments"][number] | undefined): TipMethod {
  if (!tip) return "pretax";
  if (tip.split === "equal") return "equal";
  if (tip.value.type === "amount") return "fixed";
  return tip.basis === "posttax" ? "posttax" : "pretax";
}

export default function TipPicker({ bill, split }: { bill: Bill; split: SplitResult }) {
  const tip = bill.adjustments.find((a) => a.kind === "tip");
  // No tip row, or a fixed-amount one (not creatable in v1), counts as no preset selected.
  const method = methodOf(tip);
  const isAmount = tip?.value.type === "amount";
  const basis = tip?.basis ?? "pretax";
  const tipSplit: SplitMode = tip?.split ?? "proportional";
  const bps = tip ? (tip.value.type === "percent" ? tip.value.bps : null) : 0;
  const isPreset = bps !== null && (PRESETS as readonly number[]).includes(bps);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [text, setText] = useState(() =>
    bps !== null && !isPreset ? formatBps(bps).replace("%", "") : "",
  );
  const [amountText, setAmountText] = useState(() =>
    tip?.value.type === "amount" ? formatMoney(tip.value.cents, bill.currency).replace(/[^\d.]/g, "") : "",
  );
  const [error, setError] = useState<string | null>(null);
  const tipCents = split.adjustments.find((a) => a.kind === "tip")?.cents ?? 0;

  async function save(value: AmountSpec | number, nextBasis = basis, nextSplit = tipSplit) {
    try {
      const { setTip } = await import("@/lib/repo");
      await setTip(bill.id, buildTipSpec(value, nextBasis, nextSplit));
    } catch {
      toast("Couldn’t save the tip", true);
    }
  }

  function changeMethod(next: TipMethod) {
    setError(null);
    if (next === "equal") return void save(tip?.value ?? { type: "percent", bps: tip ? (bps ?? 2000) : 2000 }, basis, "equal");
    if (next === "fixed") {
      const cents = parseMoney(amountText, bill.currency);
      return void save({ type: "amount", cents: cents ?? 0 }, "pretax", "proportional");
    }
    const percent = tip?.value.type === "percent" ? tip.value : { type: "percent" as const, bps: 2000 };
    setCustomOpen(!(PRESETS as readonly number[]).includes(percent.bps));
    void save(percent, next, "proportional");
  }

  function commitAmount() {
    const trimmed = amountText.trim();
    if (trimmed === "") return setError(null);
    const cents = parseMoney(trimmed, bill.currency);
    if (cents === null) return setError("Enter a valid amount");
    setError(null);
    void save({ type: "amount", cents }, "pretax", tipSplit);
  }

  function commitCustom() {
    const trimmed = text.trim();
    if (trimmed === "") return setError(null);
    const parsed = parsePercent(trimmed);
    if (parsed === null) return setError("Enter a percentage like 18.5 (up to 2 decimals)");
    setError(null);
    void save(parsed);
  }

  const showAmount = isAmount;

  return (
    <section aria-label="Tip" className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-ink">Tip</h2>
        <p data-testid="tip-amount" className="text-base text-ink">
          Tip <Money cents={tipCents} currency={bill.currency} />
        </p>
      </div>
      <SplitMethodSelect kind="tip" value={method} onChange={changeMethod} headcount={bill.people.length} />
      {showAmount ? (
        <Field label="Tip amount" error={error ?? undefined}>
          {({ id, describedBy, invalid }) => (
            <MoneyInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              placeholder="0.00"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              onBlur={commitAmount}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitAmount();
                }
              }}
            />
          )}
        </Field>
      ) : null}
      {!showAmount ? <div role="group" aria-label="Tip percentage" className="flex flex-wrap gap-x-2">
        {PRESETS.map((p) => (
          <Chip
            key={p}
            pressed={!customOpen && bps === p}
            onPressedChange={() => {
              setCustomOpen(false);
              setError(null);
              void save(p);
            }}
          >
            {formatBps(p)}
          </Chip>
        ))}
        <Chip pressed={customOpen} onPressedChange={() => setCustomOpen(true)}>
          Custom %
        </Chip>
      </div> : null}
      {!showAmount && customOpen ? (
        <Field label="Custom tip %" error={error ?? undefined}>
          {({ id, describedBy, invalid }) => (
            <MoneyInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              placeholder="18.5"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={commitCustom}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitCustom();
                }
              }}
            />
          )}
        </Field>
      ) : null}
      <p className="text-sm text-ink-muted">
        Gratuity already on the receipt? Add it as a fee and set the tip to 0%
      </p>
    </section>
  );
}
