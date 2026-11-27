"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ClaimBoard } from "@/app/components/split/ClaimBoard";
import ItemSplitSheetHost, { openItemSplit } from "@/app/components/split/ItemSplitSheetHost";

// Pre-agreed mount points (plan "shared touch points"):
//   #20 → done: `openItemSplit` comes from ItemSplitSheetHost, which is rendered below. The
//         item id stays in local state, never in the URL (spec §11).
//   #21 → render <TotalsTray billId activePersonId onSelectPerson /> below the board.
export default function SplitPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <main className="pb-40">
      <Suspense fallback={null}>
        <ClaimBoard billId={id} onOpenItemSplit={openItemSplit} />
        <ItemSplitSheetHost billId={id} />
      </Suspense>
      {/* #21: <TotalsTray billId={id} activePersonId={…} onSelectPerson={…} /> */}
    </main>
  );
}
