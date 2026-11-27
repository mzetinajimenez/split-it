"use client";

// SplitMethodSelect (#33): a native <select> (≥44px) plus a one-line plain-language
// description of the selected method. Purely presentational: the callers map the chosen
// method to the engine's { value, basis, split } and every amount shown comes from
// SplitResult. The equal copy names the headcount.

import { Field } from "@/app/components/ui";

export type TipMethod = "pretax" | "posttax" | "fixed" | "equal";
export type AdjustmentMethod = "proportional" | "equal";

const TIP_LABELS: Record<TipMethod, string> = {
  pretax: "% of pre-tax subtotal, in proportion",
  posttax: "% of post-tax total, in proportion",
  fixed: "Fixed amount, in proportion",
  equal: "Split equally",
};
const ADJUSTMENT_LABELS: Record<AdjustmentMethod, string> = {
  proportional: "In proportion to what each person ordered",
  equal: "Split equally",
};

export function describeMethod(method: TipMethod | AdjustmentMethod, headcount: number): string {
  switch (method) {
    case "pretax":
      return "Bigger orders tip more. Tip is a % of the pre-tax subtotal.";
    case "posttax":
      return "Bigger orders tip more. Tip is a % of the total including tax.";
    case "fixed":
      return "A set amount, shared by what each person ordered.";
    case "proportional":
      return "Bigger orders pay more.";
    case "equal":
      return headcount === 1
        ? "Split equally: just 1 person on the bill"
        : `Split equally between all ${headcount} people`;
  }
}

export default function SplitMethodSelect<T extends TipMethod | AdjustmentMethod>({
  label = "Split method",
  value,
  onChange,
  kind,
  headcount,
  disabled,
}: {
  label?: string;
  value: T;
  onChange: (next: T) => void;
  kind: "tip" | "adjustment";
  headcount: number;
  disabled?: boolean;
}) {
  const labels: Record<string, string> = kind === "tip" ? TIP_LABELS : ADJUSTMENT_LABELS;
  return (
    <Field label={label} hint={describeMethod(value, headcount)}>
      {({ id, describedBy }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="min-h-11 w-full rounded-sm border border-rule-strong bg-raised px-3 text-base text-ink focus-visible:border-ink"
        >
          {Object.entries(labels).map(([v, text]) => (
            <option key={v} value={v}>
              {text}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
