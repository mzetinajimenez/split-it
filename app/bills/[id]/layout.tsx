"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import BillHeader from "@/app/components/workspace/BillHeader";
import StepNav from "@/app/components/workspace/StepNav";
import { EmptyState, ReceiptGlyph } from "@/app/components/ui";
import { useSplit } from "@/lib/hooks";

// The frame every bill step renders inside: header, step content, StepNav. A missing or
// deleted bill id gets the not-found state instead.
export default function BillLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const data = useSplit(id);

  if (data === undefined) return <div aria-busy className="min-h-dvh" />;
  if (data === null) {
    return (
      <main>
        <EmptyState
          icon={<ReceiptGlyph />}
          title="Bill not found"
          body="It may have been deleted, or the link is wrong."
          action={
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-sm bg-accent px-4 text-sm font-medium text-on-accent active:bg-accent-deep md:hover:bg-accent-deep"
            >
              Back to bills
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <>
      <Suspense fallback={null}>
        <BillHeader bill={data.bill} totalCents={data.split.grandTotalCents} />
      </Suspense>
      <StepNav billId={id} split={data.split} />
      {children}
    </>
  );
}
