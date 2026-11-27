"use client";

import { ChevronGlyph, Money } from "@/app/components/ui";
import type { Item } from "@/lib/types";

/** One receipt line: name, `2 ×` when qty > 1, and the line price. Tap opens the ItemSheet. */
export default function ItemRow({
  item,
  currency,
  onOpen,
}: {
  item: Item;
  currency: string;
  onOpen: (itemId: string) => void;
}) {
  return (
    <li className="border-b border-rule">
      <button
        type="button"
        onClick={() => onOpen(item.id)}
        aria-label={`Edit ${item.name}`}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left active:bg-ground-deep md:hover:bg-ground-deep"
      >
        <span className="min-w-0 flex-1 truncate text-base text-ink">{item.name}</span>
        {item.quantity > 1 ? (
          <span className="font-mono text-sm text-ink-muted tabular">{item.quantity} ×</span>
        ) : null}
        <Money cents={item.priceCents} currency={currency} className="text-base text-ink" />
        <ChevronGlyph className="size-4 text-ink-muted" />
      </button>
    </li>
  );
}
