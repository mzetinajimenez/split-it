"use client";

import { useState } from "react";
import Sheet from "../Sheet";
import { toast } from "../Toast";
import { Avatar, Button } from "../ui";
import { initials } from "@/lib/people";
import type { Person } from "@/lib/types";

/** "Split the rest evenly": pick people (everyone by default), then `claimRemaining`. */
export function SplitRestSheet({
  billId,
  people,
  unclaimedCount,
  onClose,
}: {
  billId: string;
  people: readonly Person[];
  unclaimedCount: number;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(people.map((p) => p.id)));
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function submit() {
    if (chosen.size === 0 || busy) return;
    setBusy(true);
    try {
      const { claimRemaining } = await import("@/lib/repo");
      await claimRemaining(billId, people.filter((p) => chosen.has(p.id)).map((p) => p.id));
      onClose();
    } catch {
      toast("Couldn't split the rest. Try again.", true);
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Split the rest"
      onClose={onClose}
      footer={
        <Button size="lg" variant="primary" className="w-full" disabled={chosen.size === 0 || busy} onClick={submit}>
          Split {unclaimedCount} {unclaimedCount === 1 ? "item" : "items"} among {chosen.size}
        </Button>
      }
    >
      <p className="pb-2 text-sm text-ink-muted">
        Unclaimed items are shared evenly between the people you choose. Items already claimed stay as they are.
      </p>
      <ul className="flex flex-col">
        {people.map((p) => (
          <li key={p.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5 active:bg-ground-deep">
              <input
                type="checkbox"
                checked={chosen.has(p.id)}
                onChange={() => toggle(p.id)}
                className="size-5 accent-accent"
              />
              <Avatar initials={initials(p.name)} colorIndex={p.colorIndex} />
              <span className="text-base text-ink">{p.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
