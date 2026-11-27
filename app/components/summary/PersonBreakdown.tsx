"use client";

import { useState } from "react";
import { formatShare } from "@/lib/formatShare";
import { initials } from "@/lib/people";
import type { Bill, PersonResult, SplitResult } from "@/lib/types";
import { Avatar, CheckGlyph, ChevronGlyph, Money } from "../ui";

/**
 * One row per person: big total, "owes X" / "paid", an expandable breakdown, and (unless
 * `readOnly`) a Mark paid toggle. Prop-driven: the only state is each row's disclosure.
 */
export function PersonBreakdown({
  bill,
  split,
  readOnly = false,
  partial = false,
  onSetSettled,
}: {
  bill: Bill;
  split: SplitResult;
  readOnly?: boolean;
  /** Totals are "so far" (items still unclaimed). */
  partial?: boolean;
  onSetSettled?: (personId: string, settled: boolean) => void;
}) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Per-person totals">
      {split.people.map((result) => {
        const person = bill.people.find((p) => p.id === result.personId);
        if (!person) return null;
        return (
          <PersonRow
            key={person.id}
            bill={bill}
            result={result}
            name={person.name}
            colorIndex={person.colorIndex}
            readOnly={readOnly}
            partial={partial}
            onSetSettled={onSetSettled}
          />
        );
      })}
    </ul>
  );
}

function PersonRow({
  bill,
  result,
  name,
  colorIndex,
  readOnly,
  partial,
  onSetSettled,
}: {
  bill: Bill;
  result: PersonResult;
  name: string;
  colorIndex: number;
  readOnly: boolean;
  partial: boolean;
  onSetSettled?: (personId: string, settled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const { currency } = bill;
  const isPayer = bill.paidBy === result.personId;
  const payerName = bill.people.find((p) => p.id === result.owesTo)?.name;
  const panelId = `breakdown-${result.personId}`;

  const extras: { label: string; cents: number; signed?: boolean }[] = [
    { label: "Subtotal", cents: result.subtotalCents },
    { label: "Discounts", cents: result.discountCents },
    { label: "Tax", cents: result.taxCents },
    { label: "Fees", cents: result.feeCents },
    { label: "Tip", cents: result.tipCents },
  ].filter((r) => r.cents !== 0);

  return (
    <li
      data-testid={`person-${name}`}
      className={`rounded-sm border border-rule bg-raised ${result.settled ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left active:bg-ground-deep md:hover:bg-ground-deep"
      >
        <Avatar initials={initials(name)} colorIndex={colorIndex} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 truncate font-medium text-ink">
            {name}
            {result.settled ? <CheckGlyph className="size-4 text-accent-deep" /> : null}
          </span>
          <span className="block truncate text-sm text-ink-muted">
            {result.settled ? "settled" : isPayer ? "paid" : payerName ? `owes ${payerName}` : partial ? "so far" : ""}
          </span>
        </span>
        <Money
          cents={result.totalCents}
          currency={currency}
          className="font-display text-2xl font-bold text-ink"
        />
        <ChevronGlyph direction={open ? "up" : "down"} className="text-ink-muted" />
      </button>

      {open ? (
        <div id={panelId} className="flex flex-col gap-1 border-t border-rule px-3 py-3 text-sm">
          {result.lines.map((line) => {
            const frac = formatShare(line.shares, line.totalShares);
            const weighted = line.shares > 1 && line.shares < line.totalShares;
            return (
              <div key={line.itemId} className="flex items-baseline justify-between gap-3 text-ink">
                <span className="min-w-0">
                  {frac ? `${frac} ` : ""}
                  {line.name}
                  {weighted ? ` (${line.shares} of ${line.totalShares} shares)` : ""}
                </span>
                <Money cents={line.cents} currency={currency} />
              </div>
            );
          })}
          {extras.length > 0 ? <hr className="my-1 border-rule" /> : null}
          {extras.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 text-ink-muted">
              <span>{row.label}</span>
              <Money cents={row.cents} currency={currency} />
            </div>
          ))}
        </div>
      ) : null}

      {!readOnly && !isPayer ? (
        <div className="border-t border-rule px-3">
          <button
            type="button"
            aria-pressed={result.settled}
            onClick={() => onSetSettled?.(result.personId, !result.settled)}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent-deep"
          >
            <CheckGlyph className="size-4" />
            {result.settled ? "Paid ✓ (undo)" : "Mark paid"}
          </button>
        </div>
      ) : null}
    </li>
  );
}
