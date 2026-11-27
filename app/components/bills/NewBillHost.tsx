"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { NEW_BILL_EVENT } from "../nav/newBill";
import { toast } from "../Toast";

/**
 * Listens for the nav's "New bill" event, creates one bill and routes to its Receipt step.
 * A ref guard drops a second event while the first create is in flight (double-tap), so one
 * tap sequence never makes two bills.
 */
export function NewBillHost() {
  const router = useRouter();
  const busy = useRef(false);

  useEffect(() => {
    void import("@/lib/repo"); // prefetch so the tap isn't waiting on the chunk
    const onNewBill = () => {
      if (busy.current) return;
      busy.current = true;
      import("@/lib/repo")
        .then(({ createBill }) => createBill())
        .then((bill) => router.push(`/bills/${bill.id}/receipt`))
        .catch(() => toast("Couldn't create the bill", true))
        .finally(() => {
          busy.current = false;
        });
    };
    window.addEventListener(NEW_BILL_EVENT, onNewBill);
    return () => window.removeEventListener(NEW_BILL_EVENT, onNewBill);
  }, [router]);

  return null;
}
