"use client";

// BillHeader: back to `/`, the title (tap → `?sheet=bill-details`) and the grand total. The
// sheet body is a lazy chunk because it pulls in the write path (@/lib/repo).

import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronGlyph, HeaderShell, Money } from "@/app/components/ui";
import { useSheetParam } from "@/lib/useSheetParam";
import type { Bill } from "@/lib/types";

const BillDetailsSheet = dynamic(() => import("./BillDetailsSheet"));

export default function BillHeader({ bill, totalCents }: { bill: Bill; totalCents: number }) {
  const { open, openSheet, closeSheet } = useSheetParam("bill-details");
  return (
    <>
      <HeaderShell
        back={
          <Link
            href="/"
            aria-label="Back to bills"
            className="flex size-11 items-center justify-center rounded-sm text-ink active:bg-ground-deep md:hover:bg-ground-deep"
          >
            <ChevronGlyph direction="left" className="size-5" />
          </Link>
        }
        title={
          <button
            type="button"
            onClick={openSheet}
            aria-label={`${bill.title}, edit bill details`}
            className="-my-2 block min-h-11 max-w-full truncate rounded-sm text-left font-display font-bold active:bg-ground-deep md:hover:bg-ground-deep"
          >
            {bill.title}
          </button>
        }
        actions={
          <span className="pr-2 text-base font-semibold text-ink">
            <Money cents={totalCents} currency={bill.currency} />
          </span>
        }
      />
      {open ? <BillDetailsSheet bill={bill} onClose={closeSheet} /> : null}
    </>
  );
}
