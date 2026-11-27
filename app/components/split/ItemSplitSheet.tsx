"use client";

// ItemSplitSheet (#20, spec §5.3 / §8 "Split → ItemSplitSheet"): precise control over one
// item. Edits stay in local `draft` state until Done, which writes once with `setClaims`;
// closing any other way (✕, Escape, backdrop, Back) discards them. The live preview calls
// `previewItemSplit` with the bill's `paidBy`, so it is exactly what `computeSplit` will do.

import { useState } from "react";
import Sheet from "@/app/components/Sheet";
import { ConfirmBox } from "@/app/components/ConfirmBox";
import { toast } from "@/app/components/Toast";
import { Avatar, Button, Money, Stepper } from "@/app/components/ui";
import { initials } from "@/lib/people";
import { previewItemSplit } from "@/lib/split";
import type { Bill, Item } from "@/lib/types";

const MAX_SHARES = 99;

/** An on/off switch: a 44px-tall button with `role="switch"` and a visible track. */
function Switch({
  checked,
  onChange,
  label,
  children,
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 items-center gap-3 rounded-sm text-left text-ink active:bg-ground-deep md:hover:bg-ground-deep ${className}`}
    >
      <span
        aria-hidden
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-rule-strong"}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-raised shadow transition-transform ${checked ? "translate-x-[1.125rem]" : "translate-x-0.5"}`}
        />
      </span>
      {children}
    </button>
  );
}

export default function ItemSplitSheet({
  bill,
  item,
  onClose,
}: {
  bill: Bill;
  item: Item;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, number>>(() => {
    // Only people still on the bill; a stale id would make setClaims reject.
    const out: Record<string, number> = {};
    for (const p of bill.people) if (item.claims[p.id] > 0) out[p.id] = item.claims[p.id];
    return out;
  });
  const [confirmUnits, setConfirmUnits] = useState(false);
  const [busy, setBusy] = useState(false);

  const itemIndex = bill.items.findIndex((it) => it.id === item.id);
  const preview = previewItemSplit(item.priceCents, draft, bill.people, itemIndex, bill.paidBy);
  const selected = bill.people.filter((p) => p.id in draft);
  const everyone = bill.people.length > 0 && selected.length === bill.people.length;

  function setPerson(id: string, on: boolean) {
    setDraft((d) => {
      const next = { ...d };
      if (on) next[id] = next[id] ?? 1;
      else delete next[id];
      return next;
    });
  }

  function setEveryone(on: boolean) {
    setDraft(on ? Object.fromEntries(bill.people.map((p) => [p.id, 1])) : {});
  }

  function splitEvenly() {
    setDraft((d) => Object.fromEntries(Object.keys(d).map((id) => [id, 1])));
  }

  async function done() {
    setBusy(true);
    try {
      // Dynamic: keeps zod + the repo layer out of the route's first-load chunk (as #19 does).
      const { setClaims } = await import("@/lib/repo");
      await setClaims(bill.id, item.id, draft);
      onClose();
    } catch {
      toast("Couldn’t save the split", true);
      setBusy(false);
    }
  }

  async function splitIntoUnits() {
    setBusy(true);
    try {
      const { explodeItem } = await import("@/lib/repo");
      await explodeItem(bill.id, item.id);
      onClose();
    } catch {
      toast("Couldn’t split the item", true);
      setBusy(false);
      setConfirmUnits(false);
    }
  }

  return (
    <Sheet
      title={item.name}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setDraft({})} disabled={busy || selected.length === 0}>
            Clear
          </Button>
          <Button variant="primary" className="flex-1" onClick={done} disabled={busy}>
            Done
          </Button>
        </div>
      }
    >
      <p className="flex items-baseline justify-between gap-3 pb-3 text-ink-muted">
        <span className="font-mono tabular">{item.quantity} ×</span>
        <Money cents={item.priceCents} currency={bill.currency} className="text-lg text-ink" />
      </p>

      {bill.people.length === 0 ? (
        <p className="py-6 text-center text-ink-muted">Add people to split this item.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-y border-rule py-1">
            <Switch checked={everyone} onChange={setEveryone} label="Everyone">
              <span className="font-medium">Everyone</span>
            </Switch>
            <Button variant="ghost" onClick={splitEvenly} disabled={selected.length === 0}>
              Split evenly
            </Button>
          </div>

          <ul className="divide-y divide-rule">
            {bill.people.map((p) => {
              const on = p.id in draft;
              return (
                <li key={p.id} className="flex items-center gap-2 py-1" data-person={p.name}>
                  <Switch checked={on} onChange={(v) => setPerson(p.id, v)} label={p.name} className="min-w-0 flex-1">
                    <Avatar initials={initials(p.name)} colorIndex={p.colorIndex} size="md" />
                    <span className="truncate">{p.name}</span>
                  </Switch>
                  {on && (
                    <Stepper
                      label={`${p.name}’s shares`}
                      value={draft[p.id]}
                      min={1}
                      max={MAX_SHARES}
                      onChange={(n) => setDraft((d) => ({ ...d, [p.id]: n }))}
                    />
                  )}
                  <Money
                    cents={preview[p.id] ?? 0}
                    currency={bill.currency}
                    className={`w-20 text-right ${on ? "text-ink" : "text-ink-muted"}`}
                  />
                </li>
              );
            })}
          </ul>
          {selected.length === 0 && (
            <p className="pt-2 text-sm text-attention">Nobody has this yet. It stays unclaimed.</p>
          )}
        </>
      )}

      {item.quantity > 1 && (
        <div className="pt-4">
          {confirmUnits ? (
            <ConfirmBox
              message={`Turn ${item.quantity} × ${item.name} into ${item.quantity} separate items? Current claims will be cleared.`}
              confirmLabel="Split into units"
              busy={busy}
              onCancel={() => setConfirmUnits(false)}
              onConfirm={splitIntoUnits}
            />
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setConfirmUnits(true)}>
              Split into units
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}
