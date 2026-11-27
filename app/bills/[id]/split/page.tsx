"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ClaimBoard, useActivePerson } from "@/app/components/split/ClaimBoard";
import TotalsTray from "@/app/components/split/TotalsTray";
import ItemSplitSheetHost, { openItemSplit } from "@/app/components/split/ItemSplitSheetHost";

// Pre-agreed mount points (plan "shared touch points"):
//   #20 → done: `openItemSplit` comes from ItemSplitSheetHost, which is rendered below. The
//         item id stays in local state, never in the URL (spec §11).
//   #21 → done: <TotalsTray/> is mounted below the board (Split step only).
export default function SplitPage() {
  const { id } = useParams<{ id: string }>();
  const [activePersonId, setActivePerson] = useActivePerson(id);
  return (
    <main className="pb-40">
      <Suspense fallback={null}>
        <ClaimBoard billId={id} onOpenItemSplit={openItemSplit} />
        <ItemSplitSheetHost billId={id} />
      </Suspense>
      <TotalsTray billId={id} activePersonId={activePersonId} onSelectPerson={setActivePerson} />
    </main>
  );
}
