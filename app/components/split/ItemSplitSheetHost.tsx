"use client";

// Mount point for ItemSplitSheet (#19's claim board renders <ItemSplitSheetHost billId=…/>).
// Anything on the page opens it with `openItemSplit(itemId)` — a tiny module-level event, so
// the claim board needs no props or context. The item id lives in local state here, never in
// the URL; only `?sheet=split-item` is (lib/useSheetParam.ts).
//
// Must sit inside a <Suspense> boundary (useSheetParam → useSearchParams).

import { useEffect, useState } from "react";
import { useBill } from "@/lib/hooks";
import { useSheetParam } from "@/lib/useSheetParam";
import ItemSplitSheet from "./ItemSplitSheet";

const listeners = new Set<(itemId: string) => void>();

/** Ask the mounted <ItemSplitSheetHost/> to open the split sheet for `itemId`. */
export function openItemSplit(itemId: string) {
  for (const l of listeners) l(itemId);
}

export default function ItemSplitSheetHost({ billId }: { billId: string }) {
  const bill = useBill(billId);
  const { open, openSheet, closeSheet } = useSheetParam("split-item");
  const [itemId, setItemId] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (id: string) => {
      setItemId(id);
      openSheet();
    };
    listeners.add(onOpen);
    return () => {
      listeners.delete(onOpen);
    };
  });

  const item = bill?.items.find((it) => it.id === itemId);
  if (!open || !bill || !item) return null;
  // key: a different item gets a fresh draft.
  return <ItemSplitSheet key={item.id} bill={bill} item={item} onClose={closeSheet} />;
}
