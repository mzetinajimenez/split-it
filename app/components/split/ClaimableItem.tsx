"use client";

import { AvatarStack, ChevronGlyph, Money } from "../ui";
import { initials } from "@/lib/people";
import { formatMoney } from "@/lib/money";
import type { Item, Person } from "@/lib/types";

const FRACTIONS: Record<string, string> = {
  "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾", "1/5": "⅕", "2/5": "⅖", "3/5": "⅗", "4/5": "⅘", "1/6": "⅙", "5/6": "⅚",
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

function fraction(part: number, whole: number): string {
  const g = gcd(part, whole);
  const key = `${part / g}/${whole / g}`;
  return FRACTIONS[key] ?? key;
}

/** Display-only caption for 2+ claimants, e.g. "2 of 4 · ½ each" or "⅔ · ⅓". */
export function shareCaption(shares: number[], peopleCount: number): string | null {
  if (shares.length < 2) return null;
  const total = shares.reduce((a, b) => a + b, 0);
  if (shares.every((s) => s === shares[0])) {
    return `${shares.length} of ${peopleCount} · ${fraction(1, shares.length)} each`;
  }
  return shares.map((s) => fraction(s, total)).join(" · ");
}

/**
 * One claimable row: a main button (toggle claim, or open the split sheet with nobody
 * selected) and a chevron button that always opens the item split sheet.
 */
export function ClaimableItem({
  item,
  people,
  currency,
  activeId,
  onTap,
  onOpenSplit,
}: {
  item: Item;
  people: readonly Person[];
  currency: string;
  activeId: string | null;
  onTap: (itemId: string) => void;
  onOpenSplit: (itemId: string) => void;
}) {
  const claimants = people.filter((p) => (item.claims[p.id] ?? 0) > 0);
  const unclaimed = claimants.length === 0;
  const mine = activeId !== null && claimants.some((p) => p.id === activeId);
  const caption = shareCaption(claimants.map((p) => item.claims[p.id]), people.length);
  const price = formatMoney(item.priceCents, currency);
  const label = [
    item.name,
    price,
    unclaimed ? "unclaimed" : `claimed by ${claimants.map((p) => p.name).join(" and ")}`,
    mine ? "you have claimed this" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <li
      className={`flex items-stretch rounded-sm border bg-raised ${
        mine ? "border-accent ring-1 ring-accent" : "border-rule"
      }`}
    >
      <button
        type="button"
        aria-label={label}
        onClick={() => onTap(item.id)}
        className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-l-sm px-3 py-2 text-left transition active:scale-[0.99] active:bg-ground-deep md:hover:bg-ground-deep ${
          mine ? "bg-ground-deep" : ""
        }`}
      >
        <span
          aria-hidden
          className={`grid size-6 shrink-0 place-items-center rounded-full border ${
            mine ? "border-accent bg-accent text-on-accent" : "border-rule-strong text-transparent"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="size-4">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium text-ink">
            {item.quantity > 1 ? `${item.quantity}× ` : ""}
            {item.name}
          </span>
          <span className="mt-0.5 flex min-h-6 items-center gap-2 text-sm">
            {unclaimed ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-attention">
                <span aria-hidden className="size-2 rounded-full bg-attention" />
                Unclaimed
              </span>
            ) : (
              <>
                <AvatarStack
                  people={claimants.map((p) => ({ id: p.id, initials: initials(p.name), colorIndex: p.colorIndex }))}
                />
                {caption ? <span className="text-ink-muted">{caption}</span> : null}
              </>
            )}
          </span>
        </span>
        <Money cents={item.priceCents} currency={currency} className="shrink-0 text-base text-ink" />
      </button>
      <button
        type="button"
        aria-label={`Split ${item.name} between people`}
        onClick={() => onOpenSplit(item.id)}
        className="grid min-w-11 shrink-0 place-items-center rounded-r-sm border-l border-rule text-ink-muted transition-colors active:bg-ground-deep md:hover:bg-ground-deep"
      >
        <ChevronGlyph className="size-5" />
      </button>
    </li>
  );
}
