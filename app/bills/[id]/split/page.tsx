"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { toast } from "@/app/components/Toast";
import { ClaimBoard } from "@/app/components/split/ClaimBoard";

// Pre-agreed mount points (plan "shared touch points"):
//   #20 → replace `openItemSplit` with the one from <ItemSplitSheetHost billId /> and render
//         the host below. The item id stays in local state, never in the URL (spec §11).
//   #21 → render <TotalsTray billId activePersonId onSelectPerson /> below the board.
function openItemSplit() {
  toast("Item splitting is coming soon.");
}

export default function SplitPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <main className="pb-40">
      <Suspense fallback={null}>
        <ClaimBoard billId={id} onOpenItemSplit={openItemSplit} />
        {/* #20: <ItemSplitSheetHost billId={id} /> */}
      </Suspense>
      {/* #21: <TotalsTray billId={id} activePersonId={…} onSelectPerson={…} /> */}
    </main>
  );
}
