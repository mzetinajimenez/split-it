"use client";

// AdjustmentSheet (`?sheet=adjustment`): add or edit a fee or discount: label (with
// suggestions), an amount or %, and Delete when editing. The split is always proportional in
// v1. Which adjustment is local state in the page, never the URL.

import { useState } from "react";
import Sheet from "@/app/components/Sheet";
import { toast } from "@/app/components/Toast";
import { Button, Chip, Field, MoneyInput, SegmentedControl, TextInput } from "@/app/components/ui";
import { formatBps, formatMoney, parseMoney, parsePercent } from "@/lib/money";
import type { AmountSpec, Bill } from "@/lib/types";
import type { AdjustmentTarget } from "./AdjustmentList";

type Mode = "amount" | "percent";

const SUGGESTIONS = {
  fee: ["Service charge", "Delivery", "Corkage"],
  discount: ["Happy hour", "Coupon"],
} as const;

function specText(spec: AmountSpec | undefined, currency: string): string {
  if (!spec) return "";
  return spec.type === "percent"
    ? formatBps(spec.bps).replace("%", "")
    : formatMoney(spec.cents, currency).replace(/[^\d.]/g, "");
}

export default function AdjustmentSheet({
  bill,
  target,
  onClose,
}: {
  bill: Bill;
  target: AdjustmentTarget;
  onClose: () => void;
}) {
  const existing = target.adjustmentId
    ? bill.adjustments.find((a) => a.id === target.adjustmentId)
    : undefined;
  const { kind } = target;
  const [label, setLabel] = useState(existing?.label ?? "");
  const [mode, setMode] = useState<Mode>(existing?.value.type ?? "amount");
  const [text, setText] = useState(() => specText(existing?.value, bill.currency));
  const [errors, setErrors] = useState<{ label?: string; value?: string }>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const next: typeof errors = {};
    const trimmed = label.trim();
    if (!trimmed) next.label = "Enter a label";
    let value: AmountSpec | null = null;
    if (mode === "percent") {
      const bps = parsePercent(text);
      if (bps === null) next.value = "Enter a percentage like 10 (up to 2 decimals)";
      else value = { type: "percent", bps };
    } else {
      const cents = parseMoney(text, bill.currency);
      if (cents === null) next.value = "Enter a valid amount";
      else value = { type: "amount", cents };
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || value === null) return;
    setBusy(true);
    try {
      const { upsertAdjustment } = await import("@/lib/repo");
      await upsertAdjustment(bill.id, {
        id: existing?.id,
        kind,
        label: trimmed,
        value,
        split: "proportional",
      });
      onClose();
    } catch {
      toast("Couldn’t save that", true);
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    try {
      const { removeAdjustment } = await import("@/lib/repo");
      await removeAdjustment(bill.id, existing.id);
      onClose();
    } catch {
      toast("Couldn’t delete that", true);
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={`${existing ? "Edit" : "Add"} ${kind}`}
      onClose={onClose}
      footer={
        <Button variant="primary" className="w-full" onClick={save} disabled={busy}>
          Save
        </Button>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Label" error={errors.label}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              maxLength={40}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-x-2">
          {SUGGESTIONS[kind].map((s) => (
            <Chip key={s} pressed={label === s} onPressedChange={() => setLabel(s)}>
              {s}
            </Chip>
          ))}
        </div>
        <Field label={kind === "discount" ? "Discount" : "Fee"} error={errors.value}>
          {({ id, describedBy, invalid }) => (
            <div className="flex items-start gap-2">
              <SegmentedControl<Mode>
                label={`${kind} type`}
                value={mode}
                onChange={setMode}
                options={[
                  { value: "amount", label: bill.currency === "USD" ? "$" : bill.currency },
                  { value: "percent", label: "%" },
                ]}
              />
              <MoneyInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder={mode === "percent" ? "10" : "0.00"}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-w-0"
              />
            </div>
          )}
        </Field>
        <p className="text-sm text-ink-muted">Split by what each person ordered</p>
        <button type="submit" hidden />
      </form>
      {existing ? (
        <div className="pt-4">
          <Button variant="ghost" className="w-full text-danger-deep" onClick={remove} disabled={busy}>
            Delete {kind}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
