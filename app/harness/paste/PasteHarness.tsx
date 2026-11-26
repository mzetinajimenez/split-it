"use client";

import { useEffect, useState } from "react";
import PasteReceiptSheet from "@/app/components/receipt/PasteReceiptSheet";
import { Money } from "@/app/components/ui";
import { initDb, useBill } from "@/lib/hooks";

export default function PasteHarness() {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initDb();
      const { createBill, addItem } = await import("@/lib/repo");
      // `?existing=1` starts the bill with one item, for the append/replace path.
      const bill = await createBill({ title: "Harness bill" });
      if (new URLSearchParams(window.location.search).get("existing") === "1") {
        await addItem(bill.id, { name: "Old item", priceCents: 500 });
      }
      if (!cancelled) setId(bill.id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="p-4">
      <h1 className="font-display text-2xl text-ink">Receipt harness</h1>
      {id ? <Bill id={id} /> : null}
    </main>
  );
}

function Bill({ id }: { id: string }) {
  const bill = useBill(id);
  const tax = bill?.adjustments.find((a) => a.kind === "tax");
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div>
        <PasteReceiptSheet billId={id} />
      </div>
      <ul aria-label="Items">
        {bill?.items.map((i) => (
          <li key={i.id} className="flex justify-between py-1 text-ink">
            <span>{i.name}</span>
            <Money cents={i.priceCents} currency={bill.currency} />
          </li>
        ))}
      </ul>
      <p data-testid="tax" className="text-ink">
        Tax: {tax && tax.value.type === "amount" ? <Money cents={tax.value.cents} currency={bill!.currency} /> : "none"}
      </p>
    </div>
  );
}
