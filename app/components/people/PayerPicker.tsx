"use client";

import type { Person } from "@/lib/types";

/**
 * "Who paid?" as a native radio group (arrow keys, one tab stop) over the people plus
 * "Not set". Native inputs give the radio semantics for free.
 */
export default function PayerPicker({
  people,
  paidBy,
  onChange,
}: {
  people: Person[];
  paidBy: string | null;
  onChange: (personId: string | null) => void;
}) {
  const options: { id: string | null; label: string }[] = [
    { id: null, label: "Not set" },
    ...people.map((p) => ({ id: p.id, label: p.name })),
  ];
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="pb-1 font-display text-lg font-bold text-ink">Who paid?</legend>
      <p className="pb-1 text-sm text-ink-muted">
        The payer absorbs any rounding cent when a split doesn’t divide evenly.
      </p>
      <div className="flex flex-col">
        {options.map((o) => (
          <label
            key={o.id ?? "none"}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-1 text-ink active:bg-ground-deep md:hover:bg-ground-deep"
          >
            <input
              type="radio"
              name="payer"
              className="size-5 accent-accent"
              checked={paidBy === o.id}
              onChange={() => onChange(o.id)}
            />
            <span className={o.id === null ? "text-ink-muted" : ""}>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
