"use client";

import type { Person } from "@/lib/types";
import { initials } from "@/lib/people";
import { Avatar, ChevronGlyph, Money } from "@/app/components/ui";

/** One person: avatar, name, item count and running total. Tapping opens the PersonSheet. */
export default function PersonRow({
  person,
  itemCount,
  totalCents,
  currency,
  isPayer,
  onOpen,
}: {
  person: Person;
  itemCount: number;
  totalCents: number;
  currency: string;
  isPayer: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        data-testid={`person-row-${person.name}`}
        className="flex min-h-14 w-full items-center gap-3 rounded-sm border border-rule bg-raised px-3 py-2 text-left active:bg-ground-deep md:hover:bg-ground-deep"
      >
        <Avatar initials={initials(person.name)} colorIndex={person.colorIndex} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{person.name}</span>
          <span className="block text-sm text-ink-muted">
            {itemCount} {itemCount === 1 ? "item" : "items"}
            {isPayer ? " · paid" : ""}
          </span>
        </span>
        <Money cents={totalCents} currency={currency} className="text-ink" />
        <ChevronGlyph className="size-4 text-ink-muted" />
      </button>
    </li>
  );
}
