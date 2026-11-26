// Module-level "New bill" event. The nav (BottomNav FAB, NavRail button) only announces the
// intent; the Bills-home issue (#15) mounts the listener that runs createBill() and routes to
// the new bill's receipt step. Keeping it an event means the nav imports no data layer.

export const NEW_BILL_EVENT = "split-it:new-bill";

export function emitNewBill() {
  window.dispatchEvent(new Event(NEW_BILL_EVENT));
}
