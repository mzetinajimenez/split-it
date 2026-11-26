// lib/money.ts: the ONLY code that parses, formats and allocates money (spec §5.1–5.2).
//
// Every amount is an integer number of minor units (`Cents`). All arithmetic here is exact
// integer arithmetic: divisions are done as `(x - x % d) / d`, which is exact for safe
// integers, never as `Math.floor(x / d)` on a float quotient. No floats, no BigInt.
//
// Framework-free: no React, no DOM. `Intl` is fine.

import type { Cents } from "./types";

/** zod caps every amount at this many minor units (spec §5.1). */
export const MAX_CENTS = 99_999_999;

/**
 * Formatting locale. Fixed (not the runtime default) so the server render and the client
 * render produce identical strings, and so `parseMoney` (which reads `,` as a thousands
 * separator and `.` as the decimal point) round-trips `formatMoney` output.
 */
const LOCALE = "en-US";

const digitsCache = new Map<string, number>();

/** Minor-unit digits for an ISO 4217 currency: USD → 2, JPY → 0. Throws RangeError on an invalid code. */
export function minorDigits(currency: string): number {
  const key = currency.toUpperCase();
  let digits = digitsCache.get(key);
  if (digits === undefined) {
    digits = new Intl.NumberFormat(LOCALE, { style: "currency", currency: key }).resolvedOptions()
      .maximumFractionDigits ?? 2;
    digitsCache.set(key, digits);
  }
  return digits;
}

const affixCache = new Map<string, string[]>();

/** Symbols a user (or `formatMoney`) might put around an amount in this currency, longest first. */
function currencyAffixes(currency: string): string[] {
  const key = currency.toUpperCase();
  let affixes = affixCache.get(key);
  if (affixes === undefined) {
    const set = new Set<string>([key, "$", "€", "£", "¥"]);
    for (const currencyDisplay of ["symbol", "narrowSymbol"] as const) {
      const parts = new Intl.NumberFormat(LOCALE, { style: "currency", currency: key, currencyDisplay }).formatToParts(1);
      for (const part of parts) if (part.type === "currency") set.add(part.value.toUpperCase());
    }
    affixes = [...set].sort((a, b) => b.length - a.length);
    affixCache.set(key, affixes);
  }
  return affixes;
}

/** Strip one leading and one trailing currency symbol/code (case-insensitive) and surrounding whitespace. */
function stripAffixes(input: string, currency: string): string {
  let s = input.trim();
  const upper = () => s.toUpperCase();
  for (const affix of currencyAffixes(currency)) {
    if (upper().startsWith(affix)) {
      s = s.slice(affix.length).trim();
      break;
    }
  }
  for (const affix of currencyAffixes(currency)) {
    if (upper().endsWith(affix)) {
      s = s.slice(0, s.length - affix.length).trim();
      break;
    }
  }
  return s;
}

// Whole part: plain digits, or digits grouped by `,` in threes ("1,234,567"). Then an
// optional `.` and fraction digits. ".5" and "12." are accepted.
const AMOUNT_RE = /^(\d+|\d{1,3}(?:,\d{3})+)?(?:\.(\d*))?$/;

/**
 * Parse user input into integer minor units: "12.5" → 1250, "$1,234.50" → 123450 (USD).
 *
 * Returns null for empty or non-numeric input, negative amounts (every stored amount is
 * ≥ 0; discounts are positive too), more decimals than the currency allows ("1.234" USD,
 * "1.5" JPY), malformed grouping ("12,50"), and anything above MAX_CENTS. Never returns a
 * float: the result is assembled from digit strings, never by multiplying a float.
 */
export function parseMoney(input: string, currency: string): Cents | null {
  const digits = minorDigits(currency);
  const s = stripAffixes(input, currency);
  const m = AMOUNT_RE.exec(s);
  if (!m) return null;
  const whole = (m[1] ?? "").replace(/,/g, "");
  const frac = m[2] ?? "";
  if (whole === "" && frac === "") return null; // "", ".", "$"
  if (frac.length > digits) return null;
  const wholeStripped = whole.replace(/^0+(?=\d)/, "");
  // Reject before Number() so a huge digit string never becomes an imprecise float.
  if (wholeStripped.length + digits > String(MAX_CENTS).length) return null;
  const cents = Number((wholeStripped || "0") + frac.padEnd(digits, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return cents;
}

type SignDisplay = "auto" | "always" | "exceptZero";

const formatCache = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, signDisplay: SignDisplay): Intl.NumberFormat {
  const key = `${currency.toUpperCase()}|${signDisplay}`;
  let nf = formatCache.get(key);
  if (nf === undefined) {
    nf = new Intl.NumberFormat(LOCALE, { style: "currency", currency: currency.toUpperCase(), signDisplay });
    formatCache.set(key, nf);
  }
  return nf;
}

/**
 * Format integer minor units for display: formatMoney(123450, "USD") → "$1,234.50",
 * formatMoney(1235, "JPY") → "¥1,235". The value reaches Intl as an exact decimal string
 * ("1234.50"), never as `cents / 100`. Throws RangeError if `cents` isn't a safe integer.
 */
export function formatMoney(cents: Cents, currency: string, opts?: { signDisplay?: SignDisplay }): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`formatMoney: not an integer amount: ${cents}`);
  const digits = minorDigits(currency);
  const abs = String(Math.abs(cents)).padStart(digits + 1, "0");
  const whole = abs.slice(0, abs.length - digits);
  const frac = abs.slice(abs.length - digits);
  const decimal = `${cents < 0 ? "-" : ""}${whole}${digits > 0 ? `.${frac}` : ""}` as Intl.StringNumericLiteral;
  return formatter(currency, opts?.signDisplay ?? "auto").format(decimal);
}

function assertSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer, got ${value}`);
}

/**
 * `round(baseCents × bps / 10000)`, halves rounded away from zero (spec §5.1).
 * percentOf(1000, 825) → 83 (82.5 rounds up); percentOf(-1000, 825) → -83.
 * Exact: base ≤ MAX_CENTS and bps ≤ 10000 keep the product under 2^53.
 */
export function percentOf(baseCents: Cents, bps: number): Cents {
  assertSafeInteger("percentOf baseCents", baseCents);
  assertSafeInteger("percentOf bps", bps);
  const product = baseCents * bps;
  assertSafeInteger("percentOf product", product);
  const abs = Math.abs(product);
  const rem = abs % 10_000;
  let q = (abs - rem) / 10_000;
  if (rem * 2 >= 10_000) q += 1;
  return q === 0 ? 0 : product < 0 ? -q : q;
}

/**
 * Split an integer `amount` across non-negative integer `weights` by largest remainder
 * (spec §5.2). With W = Σ weights:
 *
 * 1. floor_i = ⌊amount·w_i / W⌋, rem_i = (amount·w_i) mod W.
 * 2. The leftover k = amount − Σ floor_i (always < n) goes one unit each to the k entries
 *    with the largest rem_i.
 * 3. Ties go in rotating order from `startIndex`: (startIndex + j) mod n, so leftover
 *    pennies don't pile up on the first person. `startIndex` may be any integer.
 * 4. A negative amount allocates |amount| and negates. W = 0 → all zeros (the caller decides
 *    the fallback). Empty weights → [].
 *
 * Invariants (property-tested): Σ result === amount; |result_i − amount·w_i/W| < 1; a zero
 * weight gets 0; deterministic.
 *
 * Exactness: every product amount·w_i stays under 2^53 (Number.MAX_SAFE_INTEGER) because zod
 * caps amounts at MAX_CENTS (< 2^27) and shares at 99, so item splits (price × shares) peak
 * near 10^10. Proportional adjustment splits weight by person subtotals; those also stay far
 * below 2^53 for any real bill. If a caller ever exceeds it, this throws a RangeError rather
 * than return an inexact split.
 */
export function allocate(amount: Cents, weights: number[], startIndex = 0): Cents[] {
  const n = weights.length;
  if (n === 0) return [];
  assertSafeInteger("allocate amount", amount);
  assertSafeInteger("allocate startIndex", startIndex);
  let total = 0;
  for (const w of weights) {
    assertSafeInteger("allocate weight", w);
    if (w < 0) throw new RangeError(`allocate weight must be ≥ 0, got ${w}`);
    total += w;
  }
  assertSafeInteger("allocate Σ weights", total);
  if (total === 0 || amount === 0) return weights.map(() => 0);

  const a = Math.abs(amount);
  assertSafeInteger("allocate amount × Σ weights", a * total);

  const result: number[] = new Array(n);
  const rems: number[] = new Array(n);
  let assigned = 0;
  for (let i = 0; i < n; i++) {
    const product = a * weights[i];
    const rem = product % total;
    const floor = (product - rem) / total;
    result[i] = floor;
    rems[i] = rem;
    assigned += floor;
  }

  const leftover = a - assigned;
  if (leftover > 0) {
    const start = ((startIndex % n) + n) % n;
    const rotated = (i: number) => (i - start + n) % n;
    const order = Array.from({ length: n }, (_, i) => i).sort(
      (x, y) => rems[y] - rems[x] || rotated(x) - rotated(y),
    );
    for (let j = 0; j < leftover; j++) result[order[j]] += 1;
  }

  return amount < 0 ? result.map((c) => (c === 0 ? 0 : -c)) : result;
}

/** Basis points for display: 825 → "8.25%", 2000 → "20%", 1250 → "12.5%". */
export function formatBps(bps: number): string {
  assertSafeInteger("formatBps bps", bps);
  const abs = Math.abs(bps);
  const fracNum = abs % 100;
  const whole = (abs - fracNum) / 100;
  const frac = String(fracNum).padStart(2, "0").replace(/0+$/, "");
  return `${bps < 0 ? "-" : ""}${whole}${frac ? `.${frac}` : ""}%`;
}

const PERCENT_RE = /^(\d+)?(?:\.(\d*))?$/;

/**
 * Parse a percentage into basis points: "8.25" / "8.25%" → 825, "20" → 2000, ".5" → 50.
 * Returns null for empty or non-numeric input, negatives, more than 2 decimals (finer than
 * a basis point), and anything above 100% (10000 bps, the AmountSpec cap).
 */
export function parsePercent(input: string): number | null {
  const s = input.trim().replace(/\s*%$/, "");
  const m = PERCENT_RE.exec(s);
  if (!m) return null;
  const whole = (m[1] ?? "").replace(/^0+(?=\d)/, "");
  const frac = m[2] ?? "";
  if (whole === "" && frac === "") return null;
  if (frac.length > 2 || whole.length > 3) return null;
  const bps = Number((whole || "0") + frac.padEnd(2, "0"));
  return bps > 10_000 ? null : bps;
}
