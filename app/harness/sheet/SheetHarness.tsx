"use client";

import { useState } from "react";
import Sheet from "@/app/components/Sheet";
import { ConfirmBox } from "@/app/components/ConfirmBox";
import { Toaster, toast } from "@/app/components/Toast";
import { useSheetParam, useStripSheetParamOnLoad } from "@/lib/useSheetParam";

export default function SheetHarness() {
  // In the app this lives in AppInit (#11); the harness has no AppInit yet, so it calls it here.
  useStripSheetParamOnLoad();
  const { open, openSheet, closeSheet } = useSheetParam("demo");
  const [confirming, setConfirming] = useState(false);

  return (
    <main className="p-4">
      <h1 className="font-display text-2xl text-ink">Sheet harness</h1>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={openSheet}
          className="min-h-11 rounded-sm bg-accent px-4 text-on-accent active:bg-accent-deep md:hover:bg-accent-deep"
        >
          Open sheet
        </button>
        <button
          type="button"
          onClick={() => toast("Couldn’t save", true)}
          className="min-h-11 rounded-sm border border-rule px-4 text-ink active:bg-ground-deep md:hover:bg-ground-deep"
        >
          Show toast
        </button>
      </div>
      {open && (
        <Sheet title="Demo sheet" onClose={closeSheet}>
          {confirming ? (
            <ConfirmBox
              message="Delete this thing?"
              confirmLabel="Delete"
              onCancel={() => setConfirming(false)}
              onConfirm={() => setConfirming(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="min-h-11 rounded-sm px-4 text-danger active:bg-ground-deep md:hover:bg-ground-deep"
            >
              Delete
            </button>
          )}
        </Sheet>
      )}
      <Toaster />
    </main>
  );
}
