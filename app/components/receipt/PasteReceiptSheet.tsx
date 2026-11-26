"use client";

// "Paste receipt": a button plus the `?sheet=paste` sheet it opens. Drop it into the Receipt
// step (`<PasteReceiptSheet billId={id} />`, inside a <Suspense>, as useSheetParam requires).
//
// Flow: paste text → Parse → DraftReview → Add. Nothing is written until Add; closing the
// sheet (✕, Escape, Back) leaves the bill untouched. Which bill is local state/props, never
// the query (the route already carries the id).

import { useState } from "react";
import Sheet from "@/app/components/Sheet";
import { ConfirmBox } from "@/app/components/ConfirmBox";
import { toast } from "@/app/components/Toast";
import { Button, ReceiptGlyph } from "@/app/components/ui";
import DraftReview, { type DraftTotals } from "@/app/components/receipt/DraftReview";
import { useBill } from "@/lib/hooks";
import { minorDigits } from "@/lib/money";
import { parseReceipt } from "@/lib/receipt/parse";
import { addItems, removeItem, setTax, setTip, updateBill, upsertAdjustment } from "@/lib/repo";
import { useSheetParam } from "@/lib/useSheetParam";
import type { ItemInput, ParsedReceipt } from "@/lib/types";

type Mode = "append" | "replace";

export default function PasteReceiptSheet({ billId }: { billId: string }) {
  const { open, openSheet, closeSheet } = useSheetParam("paste");
  return (
    <>
      <Button variant="secondary" icon={<ReceiptGlyph />} onClick={openSheet}>
        Paste receipt
      </Button>
      {open ? <PasteBody billId={billId} onClose={closeSheet} /> : null}
    </>
  );
}

function PasteBody({ billId, onClose }: { billId: string; onClose: () => void }) {
  const bill = useBill(billId);
  const currency = bill?.currency ?? "USD";
  const existing = bill?.items ?? [];

  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [mode, setMode] = useState<Mode>("append");
  const [pending, setPending] = useState<{ items: ItemInput[]; totals: DraftTotals } | null>(null);
  const [busy, setBusy] = useState(false);
  const canPaste = typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";

  async function pasteFromClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setText(clip);
    } catch {
      toast("Couldn’t read the clipboard. Paste into the box instead.", true);
    }
  }

  async function commit(items: ItemInput[], totals: DraftTotals) {
    if (!bill) return;
    setBusy(true);
    try {
      // One transaction for the items. In replace mode the old rows go only after the new
      // ones are safely in, so a failure can never leave the bill emptier than it started.
      await addItems(billId, items);
      if (mode === "replace") {
        for (const item of existing) await removeItem(billId, item.id);
      }
      if (totals.taxCents !== undefined) await setTax(billId, { type: "amount", cents: totals.taxCents });
      if (totals.tipCents !== undefined) {
        await setTip(billId, {
          value: { type: "amount", cents: totals.tipCents },
          basis: "pretax",
          split: "proportional",
        });
      }
      for (const d of totals.discounts) {
        await upsertAdjustment(billId, {
          kind: "discount",
          label: d.label,
          value: { type: "amount", cents: d.cents },
          split: "proportional",
        });
      }
      const { subtotalCents, totalCents } = totals.printed;
      if (subtotalCents !== undefined || totalCents !== undefined) {
        await updateBill(billId, {
          printed: {
            ...bill.printed,
            ...(subtotalCents !== undefined ? { subtotalCents } : {}),
            ...(totalCents !== undefined ? { totalCents } : {}),
          },
        });
      }
      onClose();
      toast(`Added ${items.length} ${items.length === 1 ? "item" : "items"}`);
    } catch {
      setBusy(false);
      setPending(null);
      toast("Couldn’t add the items", true);
    }
  }

  function handleConfirm(items: ItemInput[], totals: DraftTotals) {
    if (mode === "replace" && existing.length > 0) setPending({ items, totals });
    else void commit(items, totals);
  }

  return (
    <Sheet title={parsed ? "Review items" : "Paste receipt"} onClose={onClose}>
      {parsed === null ? (
        <div className="flex flex-col gap-3 pb-2">
          <label htmlFor="paste-receipt-text" className="sr-only">
            Receipt text
          </label>
          <textarea
            id="paste-receipt-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your receipt here"
            rows={9}
            className="w-full rounded-sm border border-rule-strong bg-raised p-3 font-mono text-base text-ink placeholder:text-ink-muted focus-visible:border-ink"
          />
          <div className="flex flex-wrap gap-2">
            {canPaste ? (
              <Button variant="secondary" onClick={pasteFromClipboard}>
                Paste from clipboard
              </Button>
            ) : null}
            <Button
              variant="primary"
              className="flex-1"
              disabled={text.trim() === ""}
              onClick={() => setParsed(parseReceipt(text, { minorDigits: minorDigits(currency) }))}
            >
              Parse
            </Button>
          </div>
        </div>
      ) : pending ? (
        <ConfirmBox
          className="my-2"
          message={`Replace the ${existing.length} ${existing.length === 1 ? "item" : "items"} already on this bill? Their claims will be lost.`}
          confirmLabel="Replace"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => void commit(pending.items, pending.totals)}
        />
      ) : (
        <div className="flex flex-col gap-4 pb-2">
          {existing.length > 0 ? (
            <fieldset className="flex flex-col rounded-sm border border-rule p-3">
              <legend className="px-1 text-sm font-medium text-ink">
                This bill already has {existing.length} {existing.length === 1 ? "item" : "items"}
              </legend>
              {(["append", "replace"] as const).map((m) => (
                <label key={m} className="flex min-h-11 items-center gap-3 text-sm text-ink">
                  <input
                    type="radio"
                    name="paste-mode"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="size-5 accent-accent"
                  />
                  {m === "append" ? "Add to them" : "Replace them"}
                </label>
              ))}
            </fieldset>
          ) : null}
          <DraftReview parsed={parsed} currency={currency} busy={busy} onConfirm={handleConfirm} />
          <Button variant="ghost" onClick={() => setParsed(null)}>
            Edit pasted text
          </Button>
        </div>
      )}
    </Sheet>
  );
}
