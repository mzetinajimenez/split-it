"use client";

// QuickAddRow (spec §8 "Receipt"): name → price → Enter writes the item, clears the fields and
// puts focus back in name, so a whole receipt can be typed without touching the screen.
// Price text goes through parseMoney only. @/lib/repo is a lazy chunk (first-load budget).

import { useEffect, useRef, useState } from "react";
import { toast } from "@/app/components/Toast";
import { Button, MoneyInput, PlusGlyph, TextInput } from "@/app/components/ui";
import { parseMoney } from "@/lib/money";

const MAX_QTY = 999;

export default function QuickAddRow({ billId, currency }: { billId: string; currency: string }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [showQty, setShowQty] = useState(false);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void import("@/lib/repo");
  }, []);

  // Keep the row above the on-screen keyboard.
  const reveal = (e: { currentTarget: HTMLElement }) =>
    e.currentTarget.scrollIntoView({ block: "nearest" });

  async function commit() {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter an item name");
      nameRef.current?.focus();
      return;
    }
    const priceCents = parseMoney(price, currency);
    if (priceCents === null) {
      setError("Enter a valid price, like 12.50");
      priceRef.current?.focus();
      return;
    }
    let quantity: number | undefined;
    if (showQty && qty.trim() !== "") {
      const q = /^\d+$/.test(qty.trim()) ? Number(qty.trim()) : NaN;
      if (!(q >= 1 && q <= MAX_QTY)) {
        setError("Quantity must be a whole number, 1 or more");
        return;
      }
      quantity = q;
    }
    setBusy(true);
    try {
      const { addItem } = await import("@/lib/repo");
      await addItem(billId, { name: trimmed, priceCents, ...(quantity ? { quantity } : {}) });
      setName("");
      setQty("");
      setPrice("");
      setError(null);
      nameRef.current?.focus();
    } catch {
      toast("Couldn’t add that item. Try again.", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      aria-label="Add item"
      onSubmit={(e) => {
        e.preventDefault();
        void commit();
      }}
      className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-10 border-t border-rule-strong bg-ground px-3 py-2 md:bottom-0"
    >
      <div className="flex items-start gap-2">
        <TextInput
          ref={nameRef}
          aria-label="Item name"
          placeholder="Item"
          autoComplete="off"
          enterKeyHint="next"
          maxLength={80}
          value={name}
          invalid={error !== null && !name.trim()}
          onFocus={reveal}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              priceRef.current?.focus();
            }
          }}
          className="min-w-0 flex-1"
        />
        {showQty ? (
          <TextInput
            aria-label="Quantity"
            placeholder="Qty"
            inputMode="numeric"
            autoComplete="off"
            value={qty}
            onFocus={reveal}
            onChange={(e) => setQty(e.target.value)}
            className="w-16 text-center font-mono"
          />
        ) : null}
        <MoneyInput
          ref={priceRef}
          aria-label="Price"
          placeholder="0.00"
          enterKeyHint="done"
          value={price}
          invalid={error !== null && name.trim() !== ""}
          onFocus={reveal}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            }
          }}
          className="w-28"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p role="alert" className="min-h-6 pt-1 text-sm text-danger">
          {error}
        </p>
        <div className="flex items-center">
          {showQty ? null : (
            <Button type="button" variant="ghost" onClick={() => setShowQty(true)}>
              Qty
            </Button>
          )}
          <Button type="submit" variant="primary" icon={<PlusGlyph />} disabled={busy}>
            Add
          </Button>
        </div>
      </div>
    </form>
  );
}
