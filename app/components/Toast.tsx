"use client";

// Toast — a tiny module-level pub/sub (no React context, per global constraints). Call
// `toast("Saved")` from anywhere; mount <Toaster/> exactly once (in the root layout). Messages
// auto-dismiss after ~3s, announce politely to screen readers, and sit above the bottom bar
// clear of the home indicator.
//
// "The bottom bar" is BOTH the global BottomNav and the bill workspace's StepNav: the StepNav
// reuses the BottomNav's fixed-bottom slot, so one offset clears either. The offset is owned
// by #11's BOTTOM_BAR_CLEARANCE; until #11 lands it is the savor value below, and #11 swaps
// this class for its constant (pre-agreed touch point in the v1 plan).

import { useSyncExternalStore } from "react";
import "./overlay-motion.css";

type ToastItem = { id: number; message: string; error?: boolean };

const DISMISS_MS = 3000;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return items;
}

/** Show a transient message. Safe to call from event handlers, effects, or repo callbacks. */
export function toast(message: string, error = false) {
  const id = nextId++;
  items = [...items, { id, message, error }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, DISMISS_MS);
}

export function Toaster() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4 md:pl-60 md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
    >
      {current.map((t) => (
        <div
          key={t.id}
          className={`anim-toast pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-sm border bg-raised px-4 py-2.5 text-sm font-medium text-ink shadow-lg ${
            t.error ? "border-danger" : "border-rule"
          }`}
        >
          <span
            aria-hidden
            className={`h-2 w-2 shrink-0 rounded-full ${t.error ? "bg-danger" : "bg-accent"}`}
          />
          {t.message}
        </div>
      ))}
    </div>
  );
}
