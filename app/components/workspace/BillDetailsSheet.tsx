"use client";

// The bill-details sheet: title, date, currency, notes → updateBill. Mounted only while
// `?sheet=bill-details` is present (see BillHeader). A failed write toasts and keeps the sheet.

import { useState } from "react";
import Sheet from "@/app/components/Sheet";
import { toast } from "@/app/components/Toast";
import { Button, Field, TextInput } from "@/app/components/ui";
import { updateBill } from "@/lib/repo";
import type { Bill } from "@/lib/types";

export default function BillDetailsSheet({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const [title, setTitle] = useState(bill.title);
  const [date, setDate] = useState(bill.date);
  const [currency, setCurrency] = useState(bill.currency);
  const [notes, setNotes] = useState(bill.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await updateBill(bill.id, { title: title.trim(), date, currency: currency.trim().toUpperCase(), notes });
      onClose();
    } catch {
      toast("Couldn't save the bill details", true);
      setSaving(false);
    }
  }

  return (
    <Sheet title="Bill details" onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4 p-4">
        <Field label="Title">
          {({ id, describedBy, invalid }) => (
            <TextInput id={id} aria-describedby={describedBy} invalid={invalid} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          )}
        </Field>
        <Field label="Date">
          {({ id }) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label="Currency" hint="ISO code, e.g. USD, EUR, JPY">
          {({ id, describedBy }) => (
            <TextInput id={id} aria-describedby={describedBy} value={currency} maxLength={3} autoCapitalize="characters" onChange={(e) => setCurrency(e.target.value)} />
          )}
        </Field>
        <Field label="Notes">
          {({ id }) => (
            <textarea
              id={id}
              value={notes}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-11 w-full rounded-sm border border-rule-strong bg-raised px-3 py-2 text-base text-ink placeholder:text-ink-muted focus-visible:border-ink"
            />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" disabled={saving}>
          Save
        </Button>
      </form>
    </Sheet>
  );
}
