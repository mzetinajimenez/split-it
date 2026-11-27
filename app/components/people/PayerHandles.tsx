"use client";

// PayerHandles (#30): the payer's optional Venmo / Cash App / PayPal.me handles, shown on
// the People step under "Who paid?". The Summary turns them into pay links. Handles live only
// on this bill (and in its share links); nothing here sends them anywhere.

import { useState } from "react";
import { toast } from "@/app/components/Toast";
import { Button, Field, TextInput } from "@/app/components/ui";
import { HANDLE_RULES, isValidHandle, normalizeHandle, type PayService } from "@/lib/payLinks";
import type { PayHandles, Person } from "@/lib/types";

type Key = keyof PayHandles;

const FIELDS: { key: Key; service: PayService; label: string; prefix: string; placeholder: string }[] = [
  { key: "venmo", service: "venmo", label: "Venmo username", prefix: "@", placeholder: "username" },
  { key: "cashtag", service: "cashapp", label: "Cash App $Cashtag", prefix: "$", placeholder: "cashtag" },
  { key: "paypal", service: "paypal", label: "PayPal.me name", prefix: "paypal.me/", placeholder: "name" },
];

export default function PayerHandles({
  billId,
  payer,
}: {
  billId: string;
  payer: Person;
}) {
  const saved = payer.handles ?? {};
  const [draft, setDraft] = useState<Record<Key, string>>({
    venmo: saved.venmo ?? "",
    cashtag: saved.cashtag ?? "",
    paypal: saved.paypal ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(Object.keys(saved).length > 0);

  const errors = Object.fromEntries(
    FIELDS.map(({ key }) => [key, draft[key] !== "" && !isValidHandle(key, draft[key]) ? HANDLE_RULES[key] : undefined]),
  ) as Record<Key, string | undefined>;
  const invalid = FIELDS.some(({ key }) => errors[key] !== undefined);
  const dirty = FIELDS.some(({ key }) => draft[key] !== (saved[key] ?? ""));

  async function save() {
    if (invalid || !dirty) return;
    setBusy(true);
    try {
      const { setHandles } = await import("@/lib/repo");
      await setHandles(billId, payer.id, draft);
      toast("Saved payment handles");
    } catch {
      toast("Couldn’t save the payment handles", true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
        Add {payer.name}’s payment handles
      </Button>
    );
  }

  return (
    <section aria-labelledby="payer-handles-heading" className="flex flex-col gap-3 rounded-sm border border-rule bg-raised p-3">
      <div className="flex flex-col gap-1">
        <h2 id="payer-handles-heading" className="font-display text-lg font-bold text-ink">
          How to pay {payer.name}
        </h2>
        <p className="text-sm text-ink-muted">
          Optional. The Summary turns these into “Pay {payer.name}” links. They’re kept on this bill and in its
          share links, and never sent anywhere else.
        </p>
      </div>
      {FIELDS.map(({ key, service, label, prefix, placeholder }) => (
        <Field key={key} label={label} error={errors[key]}>
          {({ id, describedBy, invalid: bad }) => (
            <div className="flex items-stretch">
              <span
                aria-hidden="true"
                className="inline-flex items-center rounded-l-sm border border-r-0 border-rule-strong bg-ground-deep px-2 font-mono text-sm text-ink-muted"
              >
                {prefix}
              </span>
              <TextInput
                id={id}
                aria-describedby={describedBy}
                invalid={bad}
                className="rounded-l-none font-mono"
                value={draft[key]}
                placeholder={placeholder}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: normalizeHandle(service, e.target.value) }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                }}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
              />
            </div>
          )}
        </Field>
      ))}
      <Button variant="primary" className="self-start" onClick={() => void save()} disabled={busy || invalid || !dirty}>
        Save handles
      </Button>
    </section>
  );
}
