"use client";

// "Paste receipt": a button plus the `?sheet=paste` sheet it opens. Drop it into the Receipt
// step (`<PasteReceiptSheet billId={id} />`, inside a <Suspense>, as useSheetParam requires).
//
// Flow: paste text → Parse → DraftReview → Add. Nothing is written until Add; closing the
// sheet (✕, Escape, Back) leaves the bill untouched. Which bill is local state/props, never
// the query (the route already carries the id). The body is a lazy chunk (first-load budget).

import dynamic from "next/dynamic";
import { Button, ReceiptGlyph } from "@/app/components/ui";
import { useSheetParam } from "@/lib/useSheetParam";

const PasteReceiptBody = dynamic(() => import("@/app/components/receipt/PasteReceiptBody"));

export default function PasteReceiptSheet({ billId }: { billId: string }) {
  const { open, openSheet, closeSheet } = useSheetParam("paste");
  return (
    <>
      <Button variant="secondary" icon={<ReceiptGlyph />} onClick={openSheet}>
        Paste receipt
      </Button>
      {open ? <PasteReceiptBody billId={billId} onClose={closeSheet} /> : null}
    </>
  );
}
