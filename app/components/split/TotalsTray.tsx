"use client";

/*
 * TotalsTray (#21, spec §8 "Split → TotalsTray"): a bar docked above the StepNav showing what is
 * still unclaimed and what each person owes so far, tax and tip included. Every number is a
 * `SplitResult` value from `useSplit`, rendered through <Money>/formatMoney: no arithmetic here.
 * Mount it on the Split step only (#19); it unmounts with the route.
 */

import { useId, useRef, useState } from "react";
import { useSplit } from "@/lib/hooks";
import { initials } from "@/lib/people";
import { BOTTOM_BAR_CLEARANCE } from "@/app/components/nav/tabs";
import { Avatar, ChevronGlyph, Money } from "@/app/components/ui";

// Docks in the StepNav's slot (#11); at md the content column starts past the 15rem NavRail.
const DOCK = `${BOTTOM_BAR_CLEARANCE} md:left-60`;
const DRAG_THRESHOLD_PX = 24;

export interface TotalsTrayProps {
  billId: string;
  activePersonId: string | null;
  onSelectPerson(id: string): void;
}

export default function TotalsTray({ billId, activePersonId, onSelectPerson }: TotalsTrayProps) {
  const data = useSplit(billId);
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);

  if (!data) return null;
  const { bill, split } = data;
  const { currency } = bill;
  const active = split.people.find((p) => p.personId === activePersonId) ?? null;
  const unclaimedCount = split.unclaimed.itemIds.length;
  const hasUnclaimed = unclaimedCount > 0;
  if (split.status === "empty" && bill.people.length === 0) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientY;
    dragged.current = false;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragStart.current === null) return;
    const dy = e.clientY - dragStart.current;
    dragStart.current = null;
    if (Math.abs(dy) >= DRAG_THRESHOLD_PX) {
      dragged.current = true;
      setExpanded(dy < 0);
    }
  };

  return (
    <>
      {/* In-flow spacer: the page's last item is never hidden behind the fixed tray. */}
      <div aria-hidden className="h-14" />
      <section
        aria-label="Totals"
        data-testid="totals-tray"
        className={`fixed inset-x-0 z-20 border-t border-rule-strong bg-raised ${DOCK}`}
      >
        {expanded && (
          <div
            id={panelId}
            className="anim-fade max-h-[50dvh] overflow-y-auto border-b border-rule motion-reduce:animate-none"
          >
            <ul className="mx-auto max-w-2xl divide-y divide-rule">
              {bill.people.map((person) => {
                const result = split.people.find((r) => r.personId === person.id);
                if (!result) return null;
                const isActive = person.id === activePersonId;
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => onSelectPerson(person.id)}
                      aria-pressed={isActive}
                      className={`flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left active:bg-ground-deep md:hover:bg-ground-deep ${isActive ? "bg-ground-deep" : ""}`}
                    >
                      <Avatar initials={initials(person.name)} colorIndex={person.colorIndex} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base text-ink">{person.name}</span>
                        <span className="block truncate text-sm text-ink-muted">
                          <Money cents={result.subtotalCents} currency={currency} /> items ·{" "}
                          <Money cents={result.taxCents} currency={currency} /> tax ·{" "}
                          <Money cents={result.tipCents} currency={currency} /> tip
                        </span>
                      </span>
                      <Money cents={result.totalCents} currency={currency} className="text-base text-ink" />
                    </button>
                  </li>
                );
              })}
              {hasUnclaimed && (
                <li className="flex min-h-11 items-center gap-3 px-4 py-2">
                  <span className="flex-1 text-base text-attention">Unclaimed</span>
                  <Money cents={split.unclaimed.totalCents} currency={currency} className="text-base text-attention" />
                </li>
              )}
            </ul>
          </div>
        )}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? panelId : undefined}
          onClick={() => {
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            setExpanded((v) => !v);
          }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className="mx-auto flex h-14 w-full max-w-2xl touch-pan-x items-center gap-2 px-4 text-left active:bg-ground-deep md:hover:bg-ground-deep"
        >
          <ChevronGlyph direction={expanded ? "down" : "up"} className="shrink-0 text-ink-muted" />
          <span className={`min-w-0 flex-1 truncate text-base ${hasUnclaimed ? "text-attention" : "text-ink"}`}>
            {hasUnclaimed ? (
              <>
                <Money cents={split.unclaimed.totalCents} currency={currency} className="font-semibold" /> unclaimed ·{" "}
                {unclaimedCount} {unclaimedCount === 1 ? "item" : "items"}
              </>
            ) : (
              <>
                <span className="font-semibold">All claimed ✓</span> ·{" "}
                <Money cents={split.grandTotalCents} currency={currency} />
              </>
            )}
          </span>
          {active && (
            <span className="shrink-0 text-base text-ink">
              You: <Money cents={active.totalCents} currency={currency} className="font-semibold" />
            </span>
          )}
        </button>
      </section>
    </>
  );
}
