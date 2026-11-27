"use client";

import { useRef, type KeyboardEvent } from "react";
import { Avatar } from "../ui";
import { initials } from "@/lib/people";
import type { Person } from "@/lib/types";

/**
 * "Who are you?" — a horizontally scrolling radiogroup: Nobody plus one avatar per person.
 * The selection is owned by the caller (local state, never the URL). The selected person
 * gets an `accent` ring (spec §8 says "gold"; there is no gold token).
 */
export function ActivePersonBar({
  people,
  activeId,
  onSelect,
}: {
  people: readonly Person[];
  activeId: string | null;
  onSelect: (personId: string | null) => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const options: (string | null)[] = [null, ...people.map((p) => p.id)];

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const at = options.indexOf(activeId);
    const next = (at + step + options.length) % options.length;
    onSelect(options[next]);
    groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  }

  const radio = (selected: boolean) =>
    `flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-sm px-2 py-1.5 text-xs font-medium select-none transition-colors active:bg-ground-deep md:hover:bg-ground-deep ${
      selected ? "text-ink" : "text-ink-muted"
    }`;

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Who are you?"
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto px-2 py-2"
    >
      <button
        type="button"
        role="radio"
        aria-checked={activeId === null}
        tabIndex={activeId === null ? 0 : -1}
        onClick={() => onSelect(null)}
        className={radio(activeId === null)}
      >
        <span
          aria-hidden
          className={`grid size-9 place-items-center rounded-full border border-rule-strong bg-ground-deep font-mono text-sm text-ink-muted ${
            activeId === null ? "ring-2 ring-accent ring-offset-2 ring-offset-ground" : ""
          }`}
        >
          –
        </span>
        Nobody
      </button>
      {people.map((p) => {
        const selected = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(p.id)}
            className={radio(selected)}
          >
            <Avatar
              initials={initials(p.name)}
              colorIndex={p.colorIndex}
              className={selected ? "ring-2 ring-accent ring-offset-2 ring-offset-ground" : ""}
            />
            <span className="max-w-16 truncate">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
