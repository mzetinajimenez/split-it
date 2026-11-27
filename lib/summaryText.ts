// lib/summaryText.ts: the plain-text "who owes what" for navigator.share / the clipboard
// (spec §7). Renders a SplitResult; never adds, rounds or allocates money itself.
//
//   Tacos — Nov 25 · $142.80
//   Alex owes Sam $38.20
//   Blair owes Sam $41.15 (paid back)
//   Sam paid · their share $63.45
//   Unclaimed: 2 items · $12.00
//
// Without a payer each line is "Alex owes $38.20". Framework-free.

import { formatMoney } from "./money";
import type { Bill, SplitResult } from "./types";

/** "2026-11-25" → "Nov 25" in `locale`. The date is a calendar day, so format it in UTC. */
function formatDay(date: string, locale: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return date;
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(dt);
}

export function summaryText(bill: Bill, split: SplitResult, opts: { locale?: string } = {}): string {
  const locale = opts.locale ?? "en-US";
  const money = (cents: number) => formatMoney(cents, bill.currency);
  const names = new Map(bill.people.map((p) => [p.id, p.name]));
  const name = (id: string) => names.get(id) ?? "Someone";

  const lines = [`${bill.title} — ${formatDay(bill.date, locale)} · ${money(split.grandTotalCents)}`];

  let payerLine: string | null = null;
  for (const r of split.people) {
    if (bill.paidBy !== null && r.personId === bill.paidBy) {
      payerLine = `${name(r.personId)} paid · their share ${money(r.totalCents)}`;
      continue;
    }
    const to = r.owesTo === null ? "" : ` ${name(r.owesTo)}`;
    lines.push(`${name(r.personId)} owes${to} ${money(r.totalCents)}${r.settled ? " (paid back)" : ""}`);
  }
  if (payerLine !== null) lines.push(payerLine);

  const unclaimed = split.unclaimed.itemIds.length;
  if (unclaimed > 0) {
    lines.push(`Unclaimed: ${unclaimed} ${unclaimed === 1 ? "item" : "items"} · ${money(split.unclaimed.totalCents)}`);
  }
  return lines.join("\n");
}
