"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useBill } from "@/lib/hooks";

// /bills/[id] has no content of its own: an empty bill starts on Receipt, otherwise Split.
// `replace`, so Back doesn't bounce through this redirect.
export default function BillIndexPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const bill = useBill(id);
  const target = bill ? (bill.items.length === 0 ? "receipt" : "split") : null;

  useEffect(() => {
    if (target) router.replace(`/bills/${id}/${target}`);
  }, [target, id, router]);

  return null;
}
