"use client";

// ItemSheet (`?sheet=item`): edit name / qty / price, delete, and "Split into units" when
// qty > 1. Which item is local state in the page's host, never the URL. Deleting or exploding
// a claimed item asks first (ConfirmBox). Writes go through a lazy @/lib/repo.

import { useState } from "react";
import Sheet from "@/app/components/Sheet";
import { ConfirmBox } from "@/app/components/ConfirmBox";
import { toast } from "@/app/components/Toast";
import { Button, Field, MoneyInput, TextInput } from "@/app/components/ui";
import { formatMoney, parseMoney } from "@/lib/money";
import type { Bill, Item } from "@/lib/types";

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default function ItemSheet({
  bill,
  item,
  onClose,
}: {
  bill: Bill;
  item: Item;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(String(item.quantity));
  const [price, setPrice] = useState(() => formatMoney(item.priceCents, bill.currency).replace(/[^\d.]/g, ""));
  const [errors, setErrors] = useState<{ name?: string; qty?: string; price?: string }>({});
  const [confirm, setConfirm] = useState<"delete" | "units" | null>(null);
  const [busy, setBusy] = useState(false);

  const claimers = bill.people.filter((p) => (item.claims[p.id] ?? 0) > 0).map((p) => p.name);
  const claimedBy = claimers.length > 0 ? `${joinNames(claimers)} claimed this. ` : "";

  async function save() {
    const next: typeof errors = {};
    const trimmed = name.trim();
    if (!trimmed) next.name = "Enter an item name";
    const priceCents = parseMoney(price, bill.currency);
    if (priceCents === null) next.price = "Enter a valid price";
    const q = /^\d+$/.test(qty.trim()) ? Number(qty.trim()) : NaN;
    if (!(q >= 1 && q <= 999)) next.qty = "Whole number, 1 or more";
    setErrors(next);
    if (Object.keys(next).length > 0 || priceCents === null) return;
    setBusy(true);
    try {
      const { updateItem } = await import("@/lib/repo");
      await updateItem(bill.id, item.id, { name: trimmed, quantity: q, priceCents });
      onClose();
    } catch {
      toast("Couldn’t save that item", true);
      setBusy(false);
    }
  }

  async function run(kind: "delete" | "units") {
    setBusy(true);
    try {
      const repo = await import("@/lib/repo");
      if (kind === "delete") await repo.removeItem(bill.id, item.id);
      else await repo.explodeItem(bill.id, item.id);
      onClose();
    } catch {
      toast(kind === "delete" ? "Couldn’t delete that item" : "Couldn’t split the item", true);
      setBusy(false);
      setConfirm(null);
    }
  }

  function ask(kind: "delete" | "units") {
    if (claimers.length > 0) setConfirm(kind);
    else void run(kind);
  }

  return (
    <Sheet
      title="Edit item"
      onClose={onClose}
      footer={
        <Button variant="primary" className="w-full" onClick={save} disabled={busy}>
          Save
        </Button>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Name" error={errors.name}>
          {({ id, describedBy, invalid }) => (
            <TextInput id={id} aria-describedby={describedBy} invalid={invalid} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        <div className="flex gap-3">
          <div className="w-24">
            <Field label="Qty" error={errors.qty}>
              {({ id, describedBy, invalid }) => (
                <TextInput id={id} aria-describedby={describedBy} invalid={invalid} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
              )}
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Line price" hint={Number(qty) > 1 ? "Total for all units" : undefined} error={errors.price}>
              {({ id, describedBy, invalid }) => (
                <MoneyInput id={id} aria-describedby={describedBy} invalid={invalid} value={price} onChange={(e) => setPrice(e.target.value)} />
              )}
            </Field>
          </div>
        </div>
        <button type="submit" hidden />
      </form>

      <div className="flex flex-col gap-2 pt-4">
        {confirm ? (
          <ConfirmBox
            message={
              confirm === "delete"
                ? `${claimedBy}Delete ${item.name}? Their claims on it are removed.`
                : `${claimedBy}Splitting into units clears their claims.`
            }
            confirmLabel={confirm === "delete" ? "Delete item" : "Split into units"}
            busy={busy}
            onCancel={() => setConfirm(null)}
            onConfirm={() => void run(confirm)}
          />
        ) : (
          <>
            {item.quantity > 1 ? (
              <Button variant="secondary" onClick={() => ask("units")} disabled={busy}>
                Split into units
              </Button>
            ) : null}
            <Button variant="ghost" className="text-danger-deep" onClick={() => ask("delete")} disabled={busy}>
              Delete item
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
