"use client";

// PersonSheet (?sheet=person): rename, reorder, remove one person. The person id is local
// state in the page, never in the URL. Rename is a draft saved with Save; closing any other
// way discards it. Removing someone with claims asks first (spec §5.7).

import { useState } from "react";
import Sheet from "@/app/components/Sheet";
import { ConfirmBox } from "@/app/components/ConfirmBox";
import { toast } from "@/app/components/Toast";
import { Avatar, Button, ChevronGlyph, Field, TextInput, TrashGlyph } from "@/app/components/ui";
import { initials } from "@/lib/people";
import type { Bill, Person } from "@/lib/types";
import { hasName } from "./names";

export default function PersonSheet({
  bill,
  person,
  onClose,
}: {
  bill: Bill;
  person: Person;
  onClose: () => void;
}) {
  const [name, setName] = useState(person.name);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const index = bill.people.findIndex((p) => p.id === person.id);
  const trimmed = name.trim();
  const duplicate =
    trimmed !== "" && hasName(bill.people.filter((p) => p.id !== person.id).map((p) => p.name), trimmed);

  const claimed = bill.items.filter((it) => (it.claims[person.id] ?? 0) > 0);
  const becomeUnclaimed = claimed.filter((it) => Object.keys(it.claims).every((id) => id === person.id)).length;

  async function save() {
    if (trimmed === "") return;
    if (trimmed === person.name) return onClose();
    setBusy(true);
    try {
      const { renamePerson } = await import("@/lib/repo");
      await renamePerson(bill.id, person.id, trimmed);
      onClose();
    } catch {
      toast("Couldn’t rename that person", true);
      setBusy(false);
    }
  }

  async function move(to: number) {
    try {
      const { movePerson } = await import("@/lib/repo");
      await movePerson(bill.id, person.id, to);
    } catch {
      toast("Couldn’t reorder", true);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const { removePerson } = await import("@/lib/repo");
      await removePerson(bill.id, person.id);
      onClose();
    } catch {
      toast("Couldn’t remove that person", true);
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <Sheet
      title={person.name}
      onClose={onClose}
      footer={
        <Button variant="primary" className="w-full" onClick={save} disabled={busy || trimmed === ""}>
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <div className="flex items-end gap-3">
          <Avatar initials={initials(person.name)} colorIndex={person.colorIndex} size="lg" />
          <div className="min-w-0 flex-1">
            <Field
              label="Name"
              error={duplicate ? `There’s already a ${trimmed} on this bill. Their colour tells you apart.` : undefined}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void save();
                  }}
                  maxLength={40}
                  autoComplete="off"
                />
              )}
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-ink">Order</p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              aria-label={`Move ${person.name} up`}
              icon={<ChevronGlyph direction="up" className="size-4" />}
              disabled={index <= 0}
              onClick={() => void move(index - 1)}
            />
            <Button
              variant="secondary"
              aria-label={`Move ${person.name} down`}
              icon={<ChevronGlyph direction="down" className="size-4" />}
              disabled={index >= bill.people.length - 1}
              onClick={() => void move(index + 1)}
            />
          </div>
          <p className="text-sm text-ink-muted">
            Order sets how people are listed and who gets a leftover cent first.
          </p>
        </div>

        {confirming ? (
          <ConfirmBox
            message={
              claimed.length > 0
                ? `${person.name}’s claims on ${claimed.length} ${claimed.length === 1 ? "item" : "items"} will be removed (${becomeUnclaimed} become unclaimed).`
                : `Remove ${person.name} from this bill?`
            }
            confirmLabel="Remove"
            busy={busy}
            onCancel={() => setConfirming(false)}
            onConfirm={() => void remove()}
          />
        ) : (
          <Button
            variant="secondary"
            className="self-start text-danger-deep"
            icon={<TrashGlyph className="size-4" />}
            onClick={() => (claimed.length > 0 ? setConfirming(true) : void remove())}
            disabled={busy}
          >
            Remove {person.name}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
