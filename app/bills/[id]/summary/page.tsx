"use client";

import { useParams } from "next/navigation";
import { useSplit } from "@/lib/hooks";
import { PayerLine } from "@/app/components/summary/PayerLine";
import { PersonBreakdown } from "@/app/components/summary/PersonBreakdown";
import { ShareActions } from "@/app/components/summary/ShareActions";
import { ReconcileBanner } from "@/app/components/summary/ReconcileBanner";
import { toast } from "@/app/components/Toast";
import { EmptyState, HeaderShell } from "@/app/components/ui";

export default function SummaryPage() {
  const { id } = useParams<{ id: string }>();
  const data = useSplit(id);

  if (data === undefined) return <HeaderShell title="Summary" />;
  if (data === null) {
    return (
      <>
        <HeaderShell title="Summary" />
        <EmptyState title="Bill not found" body="It may have been deleted." />
      </>
    );
  }
  const { bill, split } = data;

  return (
    <>
      <HeaderShell title="Summary" subtitle={bill.title} />
      <main className="flex flex-col gap-4 px-4 py-4">
        <ReconcileBanner bill={bill} split={split} splitHref={`/bills/${id}/split`} />
        <PayerLine
          bill={bill}
          split={split}
          onSetPayer={(personId) => import("@/lib/repo").then((r) => r.setPayer(id, personId)).catch(() => toast("Couldn’t save who paid", true))}
        />
        <PersonBreakdown
          bill={bill}
          split={split}
          partial={split.status === "unclaimed"}
          onSetSettled={(personId, settled) =>
            import("@/lib/repo").then((r) => r.setSettled(id, personId, settled)).catch(() => toast("Couldn’t save that change", true))
          }
        />
        {/* Footer slot: #24 mounts <ShareActions/> and #30 mounts <PayLinks/> here, one line each. */}
        <footer className="flex flex-col gap-3" data-slot="summary-footer">
          <ShareActions bill={bill} split={split} />
        </footer>
      </main>
    </>
  );
}
