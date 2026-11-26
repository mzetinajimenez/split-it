"use client";

import { useSyncExternalStore } from "react";
import { useStripSheetParamOnLoad } from "@/lib/useSheetParam";

// Mounts once in the root layout and renders nothing. #12 adds the `useDbInit()` call here.

// The strip must go through Next's PATCHED history.replaceState, which Next installs in an
// effect of the app router, a *parent* of the layout. Effects run children-first, so an effect
// in AppInit's own first commit would hit the unpatched native replaceState: the URL changes
// but useSearchParams() never syncs and the sheet stays open. Mounting the hook one commit
// later (after the router's effects have run) uses the patched global.
function StripSheetParam() {
  useStripSheetParamOnLoad();
  return null;
}

const noopSubscribe = () => () => {};

export function AppInit() {
  // false during SSR and hydration, true on the commit after.
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return ready ? <StripSheetParam /> : null;
}
