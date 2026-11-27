"use client";

import { useState } from "react";
import { useSettings } from "@/lib/hooks";
import { toast } from "../Toast";
import { Button, Field, TextInput } from "../ui";

const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "JPY", "MXN", "INR", "CHF", "CNY", "BRL"] as const;

function isKnownCurrency(code: string): boolean {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("currency").includes(code);
  } catch {
    return /^[A-Z]{3}$/.test(code);
  }
}

/** bps → "18" / "18.5" for the field. */
const bpsToText = (bps: number) => String(bps / 100);

/** "18" / "18.5" / "18.25" → bps, or null when not a percentage 0..100 with ≤ 2 decimals. */
function textToBps(text: string): number | null {
  const t = text.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const bps = Math.round(Number(t) * 100);
  return bps >= 0 && bps <= 10_000 ? bps : null;
}

export function DefaultsPanel() {
  const settings = useSettings();
  if (!settings) return null;
  // Remount on external change so the drafts re-seed from the stored values.
  return <DefaultsForm key={`${settings.currency}|${settings.defaultTip.bps}|${settings.defaultTip.basis}`} settings={settings} />;
}

function DefaultsForm({ settings }: { settings: NonNullable<ReturnType<typeof useSettings>> }) {
  const [currency, setCurrency] = useState(settings.currency);
  const [other, setOther] = useState("");
  const [tip, setTip] = useState(bpsToText(settings.defaultTip.bps));
  const [basis, setBasis] = useState(settings.defaultTip.basis);
  const [busy, setBusy] = useState(false);

  const otherCode = other.trim().toUpperCase();
  const otherError = otherCode !== "" && !isKnownCurrency(otherCode) ? "Not a recognised currency code" : undefined;
  const bps = textToBps(tip);
  const tipError = bps === null ? "Enter a percentage from 0 to 100" : undefined;
  const effective = otherCode !== "" && !otherError ? otherCode : currency;
  const dirty = effective !== settings.currency || (bps !== null && bps !== settings.defaultTip.bps) || basis !== settings.defaultTip.basis;
  const options: string[] = COMMON_CURRENCIES.includes(currency as (typeof COMMON_CURRENCIES)[number])
    ? [...COMMON_CURRENCIES]
    : [currency, ...COMMON_CURRENCIES];

  const save = async () => {
    if (busy || bps === null || otherError) return;
    setBusy(true);
    try {
      const { updateSettings } = await import("@/lib/repo");
      await updateSettings({ currency: effective, defaultTip: { bps, basis } });
      setOther("");
      toast("Defaults saved");
    } catch {
      toast("Couldn't save the defaults", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="defaults-h" className="flex flex-col gap-4 px-4 py-5">
      <div>
        <h2 id="defaults-h" className="font-display text-lg text-ink">
          Defaults
        </h2>
        <p className="text-sm text-ink-muted">Defaults apply to new bills only. Existing bills keep their own.</p>
      </div>
      <Field label="Currency">
        {({ id, describedBy }) => (
          <select
            id={id}
            aria-describedby={describedBy}
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              setOther("");
            }}
            className="min-h-11 w-full rounded-sm border border-rule-strong bg-raised px-3 text-base text-ink focus-visible:border-ink"
          >
            {options.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Other currency code" hint="Any ISO 4217 code, e.g. SEK." error={otherError}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={other}
            maxLength={3}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => setOther(e.target.value)}
          />
        )}
      </Field>
      <Field label="Default tip (%)" hint="Split in proportion to what each person ordered." error={tipError}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            inputMode="decimal"
            autoComplete="off"
            value={tip}
            onChange={(e) => setTip(e.target.value)}
          />
        )}
      </Field>
      <Field label="Default tip basis">
        {({ id }) => (
          <select
            id={id}
            value={basis}
            onChange={(e) => setBasis(e.target.value as "pretax" | "posttax")}
            className="min-h-11 w-full rounded-sm border border-rule-strong bg-raised px-3 text-base text-ink focus-visible:border-ink"
          >
            <option value="pretax">Pre-tax subtotal</option>
            <option value="posttax">Post-tax total</option>
          </select>
        )}
      </Field>
      <Button variant="primary" disabled={!dirty || busy || bps === null || !!otherError} onClick={() => void save()}>
        Save defaults
      </Button>
    </section>
  );
}
