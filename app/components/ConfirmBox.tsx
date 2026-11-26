"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/* ─── ConfirmBox ────────────────────────────────────────────────────────────
   The inline destructive-confirm step (ported from savor's ui.tsx; in its own file here so
   it doesn't collide with #4's ui.tsx). `role="alertdialog"` (not just a danger-tinted div)
   is what tells a screen reader something now needs a decision, and the focus move is what
   puts the reader inside it — without it the box appears visually and silently, and the
   user's focus is still on a "Delete" button that has just changed meaning. It is inline
   rather than an overlay on purpose: it is a confirm STEP inside an open sheet, not a second
   sheet stacked on the first.

   The focus move must be symmetric: on unmount (Cancel, or Confirm completing and the caller
   flipping its confirming-state back off) focus has to return to whatever was focused before
   the box appeared — otherwise it falls to <body>, and useModalA11y's Tab trap (which only
   intervenes when the active element is the first/last focusable inside the sheet) never
   fires, letting Tab escape into background chrome. Mirrors useModalA11y's own
   previouslyFocused-on-unmount pattern (lib/useModalA11y.ts). */
export function ConfirmBox({
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  onCancel,
  onConfirm,
  className = "",
}: {
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const messageId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // The enclosing Sheet's dialog panel (rendered with tabIndex={-1}), used as a fallback
    // restore target below.
    const dialogPanel = boxRef.current?.closest('[role="dialog"]') as HTMLElement | null;
    boxRef.current?.focus();
    return () => {
      // previouslyFocused is very often the trigger button that opened this box (e.g.
      // "Delete bill"), and that button is frequently swapped out for ConfirmBox in the
      // very same commit — the two are branches of one ternary. Focusing a node React has
      // already detached from the document is a silent no-op, so without this check focus
      // falls through to <body> and the sheet's Tab trap in useModalA11y never re-engages.
      // Restore to it only if it's still attached; otherwise fall back to the enclosing
      // dialog panel so focus stays inside the trap. If neither exists (a call site that
      // isn't inside a Sheet), do nothing rather than focus something arbitrary.
      //
      // <body> counts as "nothing to restore to" (fixed in the port, #5): this effect runs
      // after the commit, so when the trigger was swapped out in that same commit the browser
      // has ALREADY dropped focus to <body> by the time previouslyFocused is read. <body> is
      // connected, so savor's isConnected check alone picked it and the fallback never ran —
      // exactly the escape-the-trap case above. e2e/sheet.spec.ts pins the fallback.
      if (
        previouslyFocused &&
        previouslyFocused !== document.body &&
        previouslyFocused.isConnected
      ) {
        previouslyFocused.focus();
      } else {
        dialogPanel?.focus();
      }
    };
  }, []);

  return (
    <div
      ref={boxRef}
      role="alertdialog"
      aria-labelledby={messageId}
      tabIndex={-1}
      className={`flex flex-col gap-3 rounded-sm bg-danger/10 p-3.5 outline-none ${className}`}
    >
      <p id={messageId} className="text-sm text-ink">
        {message}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 flex-1 rounded-sm border border-rule px-4 text-sm font-semibold text-ink transition active:scale-[0.97] active:bg-ground-deep md:hover:bg-ground-deep disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-11 flex-1 rounded-sm bg-danger-deep px-4 text-sm font-semibold text-ground transition active:scale-[0.97] md:hover:opacity-90 disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
