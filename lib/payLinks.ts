// lib/payLinks.ts: payment deep links for the Summary (#30). Pure string building: no
// network, no React, no DOM. Handles stay in the bill and in share links; this module only
// turns them into URLs the user taps themselves.
//
// URL formats, checked 2026-11-27 against the providers' public pages:
//
// - Venmo: https://venmo.com/<username>?txn=pay&amount=<decimal>&note=<url-escaped>
//   Venmo's payment-links doc (https://venmo.com/paymentlinks) documents `txn=pay`, an
//   `amount` that "can be a decimal value and should not use a $ character", and a
//   URL-escaped `note`. The web link opens the app when it's installed. USD only.
// - Cash App: https://cash.app/$<cashtag>/<decimal>
//   Cash App help (https://cash.app/help/3123) documents the https://cash.app/$yourcashtag
//   payment URL; the trailing /<amount> segment prefills the amount (Square developer forum:
//   https://developer.squareup.com/forums/t/3321; a note can't be prefilled). USD only.
// - PayPal.me: https://paypal.me/<name>/<decimal><CUR>
//   PayPal.me help (https://www.paypal.com/us/cshelp/article/what-is-paypalme-help432):
//   "paypal.me/<name>/25" requests 25 in the default currency; a currency code after the
//   amount ("25AUD") picks the currency. Currencies, and which of them take no decimals, are
//   from PayPal's currency-code reference
//   (https://developer.paypal.com/api/rest/reference/currency-codes/). No note.
//
// These formats change; re-check the pages above when touching this file.

import { minorDigits, toDecimalString } from "./money";
import type { Cents, PayHandles } from "./types";

// zod-free on purpose: the Summary and People routes import this module eagerly, so it must
// not pull zod into their first load. lib/schemas.ts builds its handle schemas from these.

/**
 * Stored handle shapes. The character sets are URL-path-safe, so a handle can never smuggle
 * a "/", "?" or "#" into a link. Venmo: letters, digits, "-" and "_", up to 30. Cashtag
 * (without "$"): letters and digits, up to 20, at least one letter. PayPal.me: letters and
 * digits, up to 20.
 */
export const HANDLE_PATTERNS = {
  venmo: /^[A-Za-z0-9_-]{1,30}$/,
  cashtag: /^(?=.*[A-Za-z])[A-Za-z0-9]{1,20}$/,
  paypal: /^[A-Za-z0-9]{1,20}$/,
} as const satisfies Record<keyof PayHandles, RegExp>;

/** The user-facing rule for each field, shown when a handle doesn't match its pattern. */
export const HANDLE_RULES: Record<keyof PayHandles, string> = {
  venmo: "Letters, numbers, - and _ only (up to 30)",
  cashtag: "Letters and numbers only, with at least one letter (up to 20)",
  paypal: "Letters and numbers only (up to 20)",
};

export const isValidHandle = (key: keyof PayHandles, value: string): boolean => HANDLE_PATTERNS[key].test(value);

export type PayService = "venmo" | "cashapp" | "paypal";

export interface PayLink {
  service: PayService;
  /** "Venmo", "Cash App", "PayPal". */
  label: string;
  url: string;
}

/** PayPal's supported currency codes (developer.paypal.com currency-code reference). */
export const PAYPAL_CURRENCIES: ReadonlySet<string> = new Set([
  "AUD", "BRL", "CAD", "CNY", "CZK", "DKK", "EUR", "HKD", "HUF", "ILS", "JPY", "MYR",
  "MXN", "TWD", "NZD", "NOK", "PHP", "PLN", "GBP", "SGD", "SEK", "CHF", "THB", "USD",
]);

/** PayPal currencies that don't support decimals (some, e.g. TWD, have two minor digits in ISO 4217 / ICU). */
const PAYPAL_NO_DECIMALS: ReadonlySet<string> = new Set(["HUF", "JPY", "TWD"]);

/** Which services can take a payment in `currency` (Venmo and Cash App: USD only). */
export function supportsCurrency(service: PayService, currency: string): boolean {
  const code = currency.toUpperCase();
  if (service === "paypal") return PAYPAL_CURRENCIES.has(code);
  return code === "USD";
}

/**
 * The amount as PayPal wants it: a plain decimal, or for a no-decimals currency that still
 * has minor digits here (TWD) the whole part only, and null if that would drop a fraction.
 */
function paypalAmount(cents: Cents, currency: string): string | null {
  const code = currency.toUpperCase();
  const digits = minorDigits(code);
  if (!PAYPAL_NO_DECIMALS.has(code) || digits === 0) return toDecimalString(cents, code);
  const unit = 10 ** digits;
  if (cents % unit !== 0) return null;
  return String((cents - (cents % unit)) / unit);
}

/**
 * Build the pay links for one amount owed to the holder of `handles`, in service order
 * Venmo, Cash App, PayPal. A service is omitted when its handle is unset or invalid, when
 * it doesn't support `currency`, or when the amount can't be expressed exactly. No links
 * for an amount ≤ 0.
 */
export function buildPayLinks(input: {
  handles: PayHandles | undefined;
  cents: Cents;
  currency: string;
  /** Free-text note; only Venmo carries one. */
  note?: string;
}): PayLink[] {
  const { handles, cents, note } = input;
  const currency = input.currency.toUpperCase();
  if (!handles || !Number.isSafeInteger(cents) || cents <= 0) return [];
  const links: PayLink[] = [];

  if (handles.venmo && isValidHandle("venmo", handles.venmo) && supportsCurrency("venmo", currency)) {
    const q = new URLSearchParams({ txn: "pay", amount: toDecimalString(cents, currency) });
    if (note && note.trim() !== "") q.set("note", note.trim());
    // URLSearchParams form-encodes (space → "+", "&" → "%26", emoji → UTF-8 %XX), which is
    // what Venmo's doc shows ("note=for+tix").
    links.push({ service: "venmo", label: "Venmo", url: `https://venmo.com/${handles.venmo}?${q}` });
  }

  if (handles.cashtag && isValidHandle("cashtag", handles.cashtag) && supportsCurrency("cashapp", currency)) {
    links.push({
      service: "cashapp",
      label: "Cash App",
      url: `https://cash.app/$${handles.cashtag}/${toDecimalString(cents, currency)}`,
    });
  }

  if (handles.paypal && isValidHandle("paypal", handles.paypal) && supportsCurrency("paypal", currency)) {
    const amount = paypalAmount(cents, currency);
    if (amount !== null) {
      links.push({ service: "paypal", label: "PayPal", url: `https://paypal.me/${handles.paypal}/${amount}${currency}` });
    }
  }

  return links;
}

/**
 * Normalise what someone types or pastes into a handle field to the bare stored form:
 * trims, strips a leading "@" / "$", and accepts a pasted profile URL
 * ("https://venmo.com/u/sam", "cash.app/$sam", "paypal.me/sam"). Returns "" for blank.
 * Validation is the schemas' job; this only peels off decoration.
 */
export function normalizeHandle(service: PayService, raw: string): string {
  let s = raw.trim();
  const hosts: Record<PayService, RegExp> = {
    venmo: /^(?:https?:\/\/)?(?:www\.|account\.)?venmo\.com\/(?:u\/)?/i,
    cashapp: /^(?:https?:\/\/)?(?:www\.)?cash\.app\//i,
    paypal: /^(?:https?:\/\/)?(?:www\.)?(?:paypal\.me|paypal\.com\/paypalme)\//i,
  };
  if (hosts[service].test(s)) s = s.replace(hosts[service], "").split(/[/?#]/)[0];
  return s.replace(/^[@$]+/, "");
}
