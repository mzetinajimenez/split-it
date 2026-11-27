import type { Metadata } from "next";
import { SharedBillView } from "@/app/components/shared/SharedBillView";

// `/s#<payload>`: a read-only shared bill (spec §7). The bill rides in the URL fragment,
// which the browser never sends to a server, so this page prerenders as an empty shell and
// SharedBillView reads `location.hash` after mount. No entity id ever goes in the query.
export const metadata: Metadata = {
  title: "Shared bill · split-it",
  robots: { index: false, follow: false },
};

export default function SharedBillPage() {
  return <SharedBillView />;
}
