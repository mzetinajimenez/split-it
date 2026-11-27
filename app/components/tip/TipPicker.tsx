"use client";

// TipPicker (spec §8 "Tip"): one-tap tip percentages, default 20% pre-tax proportional.
// The amount shown is `split.adjustments` as-is; no money math here. Text goes through
// parsePercent at the edge. @/lib/repo is a lazy chunk (prefetched by the page).

import { useState } from "react";
import { toast } from "@/app/components/Toast";
import { Chip, Field, Money, MoneyInput } from "@/app/components/ui";
import { formatBps, parsePercent } from "@/lib/money";
import type { Bill, SplitMode, SplitResult, AmountSpec } from "@/lib/types";

const PRESETS = [0, 1500, 1800, 2000, 2200] as const;

/**
 * The one place a tip struct is built. v1 is always pre-tax and proportional; #33 extends
 * this (post-tax, fixed amount, split equally) without touching the rest of the step.
 */
export function buildTipSpec(bps: number): {
  value: AmountSpec;
  basis: "pretax" | "posttax";
  split: SplitMode;
} {
  return { value: { type: "percent", bps }, basis: "pretax", split: "proportional" };
}

export default function TipPicker({ bill, split }: { bill: Bill; split: SplitResult }) {
  const tip = bill.adjustments.find((a) => a.kind === "tip");
  // No tip row, or a fixed-amount one (not creatable in v1), counts as no preset selected.
  const bps = tip ? (tip.value.type === "percent" ? tip.value.bps : null) : 0;
  const isPreset = bps !== null && (PRESETS as readonly number[]).includes(bps);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [text, setText] = useState(() =>
    bps !== null && !isPreset ? formatBps(bps).replace("%", "") : "",
  );
  const [error, setError] = useState<string | null>(null);
  const tipCents = split.adjustments.find((a) => a.kind === "tip")?.cents ?? 0;

  async function save(nextBps: number) {
    try {
      const { setTip } = await import("@/lib/repo");
      await setTip(bill.id, buildTipSpec(nextBps));
    } catch {
      toast("Couldn’t save the tip", true);
    }
  }

  function commitCustom() {
    const trimmed = text.trim();
    if (trimmed === "") return setError(null);
    const parsed = parsePercent(trimmed);
    if (parsed === null) return setError("Enter a percentage like 18.5 (up to 2 decimals)");
    setError(null);
    void save(parsed);
  }

  return (
    <section aria-label="Tip" className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-ink">Tip</h2>
        <p data-testid="tip-amount" className="text-base text-ink">
          Tip <Money cents={tipCents} currency={bill.currency} />
        </p>
      </div>
      <div role="group" aria-label="Tip percentage" className="flex flex-wrap gap-x-2">
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
      </div>
      {customOpen ? (
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
      <p className="text-sm text-ink-muted">Tip on the pre-tax total, split by what each person ordered</p>
      <p className="text-sm text-ink-muted">
        Gratuity already on the receipt? Add it as a fee and set the tip to 0%
      </p>
    </section>
  );
}
