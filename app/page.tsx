"use client";

import { useState } from "react";
import { BillRow } from "./components/bills/BillRow";
import { ConfirmBox } from "./components/ConfirmBox";
import { emitNewBill } from "./components/nav/newBill";
import { toast } from "./components/Toast";
import { Button, EmptyState, HeaderShell } from "./components/ui";
import { useBills } from "@/lib/hooks";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export default function Home() {
  const bills = useBills();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const { deleteBill } = await import("@/lib/repo");
      await deleteBill(id);
      setConfirmId(null);
      toast("Bill deleted");
    } catch {
      toast("Couldn't delete the bill", true);
    } finally {
      setBusy(false);
    }
  };

  const sorted = bills
    ? [...bills].sort(
        (a, b) => b.bill.date.localeCompare(a.bill.date) || b.bill.createdAt.localeCompare(a.bill.createdAt),
      )
    : undefined;
  const groups: { label: string; entries: NonNullable<typeof sorted> }[] = [];
  for (const e of sorted ?? []) {
    const label = monthLabel(e.bill.date);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.entries.push(e);
    else groups.push({ label, entries: [e] });
  }
  const confirming = sorted?.find((e) => e.bill.id === confirmId);

  return (
    <>
      <HeaderShell title="Bills" />
      <main>
        {sorted === undefined ? null : sorted.length === 0 ? (
          <EmptyState
            title="Split your first bill"
            body="Add the receipt, add the people, and everyone taps what they had."
            action={
              <Button variant="primary" size="lg" onClick={emitNewBill}>
                New bill
              </Button>
            }
          />
        ) : (
          groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="bg-ground-deep px-4 py-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
                {g.label}
              </h2>
              <ul>
                {g.entries.map((e) => (
                  <BillRow key={e.bill.id} entry={e} onDelete={setConfirmId} />
                ))}
              </ul>
            </section>
          ))
        )}
        {confirming ? (
          <div className="sticky bottom-24 px-4 pt-3 md:bottom-4">
            <ConfirmBox
              message={`Delete “${confirming.bill.title}”?`}
              confirmLabel="Delete"
              busy={busy}
              onCancel={() => setConfirmId(null)}
              onConfirm={() => void remove(confirming.bill.id)}
              className="border border-rule bg-raised shadow-sm"
            />
          </div>
        ) : null}
      </main>
    </>
  );
}
