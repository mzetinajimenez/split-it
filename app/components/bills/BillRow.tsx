"use client";

import Link from "next/link";
import type { BillListEntry } from "@/lib/hooks";
import { Button, Money } from "../ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Tonight", "Yesterday", else "Nov 12" (date is a local YYYY-MM-DD). */
export function shortDate(date: string, now = new Date()): string {
  if (date === ymd(now)) return "Tonight";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (date === ymd(y)) return "Yesterday";
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function BillRow({
  entry,
  onDelete,
}: {
  entry: BillListEntry;
  onDelete: (id: string) => void;
}) {
  const { bill, totalCents, unclaimedCount, settledCount, status } = entry;
  const settled = bill.people.length > 0 && settledCount === bill.people.length;
  const state =
    status === "unclaimed" ? "unclaimed" : settled ? "settled" : null;
  return (
    <li className="flex min-h-12 items-center border-b border-rule">
      <Link
        href={`/bills/${bill.id}`}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 pl-4 active:bg-ground-deep md:hover:bg-ground-deep"
      >
        <span className="min-w-0 flex-1 truncate text-base text-ink">{bill.title}</span>
        <span className="shrink-0 text-sm text-ink-muted">{shortDate(bill.date)}</span>
        <Money cents={totalCents} currency={bill.currency} className="shrink-0 text-sm text-ink" />
        <span className="flex size-3 shrink-0 items-center justify-center">
          {state ? (
            <>
              <span
                className={`size-2 rounded-full ${state === "unclaimed" ? "bg-attention" : "bg-accent"}`}
                aria-hidden
              />
              <span className="sr-only">
                {state === "unclaimed" ? `${unclaimedCount} unclaimed` : "Settled"}
              </span>
            </>
          ) : null}
        </span>
      </Link>
      <Button
        variant="ghost"
        aria-label={`Delete ${bill.title}`}
        onClick={() => onDelete(bill.id)}
        className="px-0 text-lg text-ink-muted"
      >
        ⋯
      </Button>
    </li>
  );
}
