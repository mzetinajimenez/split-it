"use client";

import { useRef, useState } from "react";
import { Button, Field, PlusGlyph, TextInput } from "@/app/components/ui";
import { hasName } from "./names";

/**
 * Add someone to the bill. Enter (or Add) submits and keeps focus in the field so a whole
 * table can be typed in a row. Suggestion chips are recent names not already on the bill. A
 * duplicate name (case-insensitive) gets an inline warning but is still allowed.
 */
export default function AddPersonField({
  names,
  suggestions,
  onAdd,
}: {
  /** Names already on this bill. */
  names: string[];
  suggestions: string[];
  onAdd: (name: string) => Promise<boolean> | boolean;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();
  const duplicate = trimmed !== "" && hasName(names, trimmed);
  const chips = suggestions.filter((s) => !hasName(names, s));

  async function submit(name: string, fromField: boolean) {
    if (name.trim() === "") return;
    const ok = await onAdd(name.trim());
    if (ok && fromField) setValue("");
    if (fromField) inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(value, true);
        }}
      >
        <div className="min-w-0 flex-1">
          <Field
            label="Add a person"
            error={duplicate ? `There’s already a ${trimmed} on this bill. You can still add another.` : undefined}
          >
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                ref={inputRef}
                aria-describedby={describedBy}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Name"
                autoComplete="off"
                enterKeyHint="done"
                maxLength={40}
              />
            )}
          </Field>
        </div>
        <Button type="submit" variant="primary" icon={<PlusGlyph className="size-4" />} disabled={trimmed === ""}>
          Add
        </Button>
      </form>
      {chips.length > 0 ? (
        <div role="group" aria-label="Recent names" className="flex flex-wrap gap-x-2">
          {chips.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => void submit(name, false)}
              className="group inline-flex min-h-11 items-center"
            >
              <span className="inline-flex h-8 items-center gap-1 rounded-sm border border-rule-strong bg-raised px-3 text-sm font-medium text-ink group-active:bg-ground-deep md:group-hover:bg-ground-deep">
                <PlusGlyph className="size-3.5" />
                {name}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
