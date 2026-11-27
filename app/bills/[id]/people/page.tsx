"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRecentPeople, useSplit } from "@/lib/hooks";
import { useSheetParam } from "@/lib/useSheetParam";
import { toast } from "@/app/components/Toast";
import { EmptyState, HeaderShell, UsersGlyph } from "@/app/components/ui";
import AddPersonField from "@/app/components/people/AddPersonField";
import PayerPicker from "@/app/components/people/PayerPicker";
import PersonRow from "@/app/components/people/PersonRow";
import PersonSheet from "@/app/components/people/PersonSheet";

function PeopleStep({ id }: { id: string }) {
  const data = useSplit(id);
  const recent = useRecentPeople();
  const { open, openSheet, closeSheet } = useSheetParam("person");
  const [personId, setPersonId] = useState<string | null>(null);

  // Prefetch the write path so the first tap doesn't wait on the chunk.
  useEffect(() => {
    void import("@/lib/repo");
  }, []);

  if (!data) return <HeaderShell title="People" />;
  const { bill, split } = data;

  async function write<T>(fn: (r: typeof import("@/lib/repo")) => Promise<T>, errorMsg: string): Promise<boolean> {
    try {
      await fn(await import("@/lib/repo"));
      return true;
    } catch {
      toast(errorMsg, true);
      return false;
    }
  }

  const selected = open ? bill.people.find((p) => p.id === personId) : undefined;

  return (
    <>
      <HeaderShell title="People" subtitle={bill.title} />
      <main className="flex flex-col gap-6 px-4 py-4">
        <AddPersonField
          names={bill.people.map((p) => p.name)}
          suggestions={recent ?? []}
          onAdd={(name) => write((r) => r.addPerson(id, name), "Couldn’t add that person")}
        />

        {bill.people.length === 0 ? (
          <EmptyState
            icon={<UsersGlyph />}
            title="Who’s splitting?"
            body="Add everyone at the table, then tap the items each person had."
          />
        ) : (
          <>
            <ul className="flex flex-col gap-2" aria-label="People">
              {bill.people.map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  itemCount={bill.items.filter((it) => (it.claims[p.id] ?? 0) > 0).length}
                  totalCents={split.people.find((r) => r.personId === p.id)?.totalCents ?? 0}
                  currency={bill.currency}
                  isPayer={bill.paidBy === p.id}
                  onOpen={() => {
                    setPersonId(p.id);
                    openSheet();
                  }}
                />
              ))}
            </ul>
            <PayerPicker
              people={bill.people}
              paidBy={bill.paidBy}
              onChange={(pid) => void write((r) => r.setPayer(id, pid), "Couldn’t save who paid")}
            />
          </>
        )}
      </main>
      {selected ? <PersonSheet key={selected.id} bill={bill} person={selected} onClose={closeSheet} /> : null}
    </>
  );
}

export default function PeoplePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <PeopleStep id={id} />
    </Suspense>
  );
}
