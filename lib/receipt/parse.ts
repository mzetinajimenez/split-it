// lib/receipt/parse.ts: pasted receipt text → draft items + detected totals (spec §6).
//
// Pure and deterministic: no React, no DOM, no clock, no randomness. Never throws, for any
// input. The output is a *draft*: it always goes to the review UI (DraftReview), never
// straight into a bill.
//
// One line at a time. A line is an item only if it ends in a price token. Every amount is
// read by `parseMoney` (lib/money.ts) from a normalised digit string, so no float ever
// touches money here.
//
// Seams left for later (out of scope for v1, see #9): decimal-comma locales ("12,50") and
// items whose price wraps onto the next line. Both land in `ignored` as `no_price` today.

import { MAX_CENTS, minorDigits, parseMoney } from "@/lib/money";
import type { Cents, DraftItem, ParsedReceipt } from "@/lib/types";

type IgnoredReason = ParsedReceipt["ignored"][number]["reason"];
type TotalsKey = keyof ParsedReceipt["totals"];

const DEFAULT_MINOR_DIGITS = 2;

/** Largest quantity we read as a quantity at all (1–3 digits); above 50 is flagged low. */
const MAX_PLAUSIBLE_QUANTITY = 50;

/** Longer lines are noise (a pasted blob, not a receipt line). */
const MAX_LINE_LENGTH = 300;

// ---------------------------------------------------------------------------------------
// Minor digits → a currency parseMoney understands
// ---------------------------------------------------------------------------------------

/** Representative ISO 4217 codes, one per minor-digit count that Intl knows about. */
const REPRESENTATIVE_CURRENCIES = ["USD", "JPY", "KWD", "CLF"];

/**
 * `parseMoney` takes a currency, `parseReceipt` takes a digit count. Map the count to a
 * currency with that many minor digits. An unsupported count (not an integer, or one no
 * representative currency has) falls back to 2, so the parser still never throws.
 */
function currencyForDigits(digits: number | undefined): { currency: string; digits: number } {
  if (digits !== undefined && Number.isInteger(digits)) {
    for (const currency of REPRESENTATIVE_CURRENCIES) {
      if (minorDigits(currency) === digits) return { currency, digits };
    }
  }
  return { currency: "USD", digits: DEFAULT_MINOR_DIGITS };
}

// ---------------------------------------------------------------------------------------
// The trailing price token
// ---------------------------------------------------------------------------------------

const SYMBOLS = "$€£¥";

interface PriceToken {
  /** Index in the line where the token starts. */
  start: number;
  /** Signed minor units. */
  cents: Cents;
}

const tokenCache = new Map<number, RegExp>();

/**
 * The trailing price token, anchored at the end of the line:
 *
 *   [-] [symbol] [-] digits(,ddd)* [.minor] [-] [symbol] [ISO code | T/F flag | 円]
 *
 * With minor digits > 0 the `.` and exactly that many digits are required, so "Table 12"
 * or a ZIP code is never a USD price. The token must start the line, follow whitespace, or
 * follow a dot leader of two or more dots ("Burger.....12.00") or an `@` ("3@4.50"). A single "." or a "/", ":"
 * or "-" right before it means it is part of something else (a date, a time, a phone
 * number), so it doesn't match. At most one minus sign, leading or trailing ("3.00-").
 */
function tokenRe(digits: number): RegExp {
  let re = tokenCache.get(digits);
  if (re === undefined) {
    const sym = `[${SYMBOLS}]`;
    const whole = `(\\d{1,3}(?:,\\d{3})+|\\d+)`;
    const frac = digits > 0 ? `\\.(\\d{${digits}})` : `()`;
    const tail = `(?:\\s*([A-Z]{3}|[TFtf]|円))?`;
    re = new RegExp(
      `(?<=^|\\s|\\.\\.|@)(-)?\\s?(${sym})?\\s?(-)?${whole}${frac}(?![\\d.,])(-)?\\s?(${sym})?${tail}\\s*$`,
      "u",
    );
    tokenCache.set(digits, re);
  }
  return re;
}

/** Find and read the trailing price token, or null if the line doesn't end in one. */
function readTrailingPrice(line: string, digits: number, currency: string): PriceToken | null {
  const m = tokenRe(digits).exec(line);
  if (!m) return null;
  const [, leadMinus, symBefore, midMinus, whole, frac, trailMinus, symAfter, suffix] = m;
  // With 0 minor digits any integer would do, so a bare one ("Table 14", "Guests: 4") needs
  // three digits to count; ¥, 円, an ISO code or a thousands separator vouches for any size.
  const marked = symBefore || symAfter || (suffix && !/^[TFtf]$/.test(suffix)) || whole.includes(",");
  if (digits === 0 && !marked && whole.length < 3) return null;
  const minuses = (leadMinus ? 1 : 0) + (midMinus ? 1 : 0) + (trailMinus ? 1 : 0);
  if (minuses > 1) return null;
  const amount = parseMoney(frac ? `${whole}.${frac}` : whole, currency);
  if (amount === null) return null;
  return { start: m.index, cents: minuses === 1 && amount !== 0 ? -amount : amount };
}

// ---------------------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------------------

const PAYMENT_RE = /\b(?:visa|mastercard|master card|amex|american express|cash|change|card|auth|authorization|approval|approved|tend|tender(?:ed)?)\b/i;

const KEYWORDS: { key: TotalsKey; re: RegExp }[] = [
  { key: "subtotalCents", re: /\bsub[\s-]?total\b/gi },
  { key: "taxCents", re: /\b(?:sales\s+)?tax(?:es)?\b|\bvat\b|\bgst\b|\bhst\b/gi },
  { key: "tipCents", re: /\btip\b|\bgratuity\b/gi },
  { key: "totalCents", re: /\btotal\b|\bamount\s+due\b|\bbalance\s+due\b/gi },
];

/** "incl. tax", "before tip", "pre-tax", "w/ gratuity": a keyword that only qualifies another. */
const QUALIFIER_BEFORE_RE = /(?:\bincl\.?|\bincluding|\bexcl\.?|\bexcluding|\bbefore|\bafter|\bwith|\bw\/|\bplus|\bpre-?|\bpost-?|\+)\s*$/i;

/**
 * Which totals bucket a line belongs to, if any. "Subtotal" never counts as "total". When
 * several keywords appear, qualified ones ("Total incl. tax") are skipped and the last of
 * the rest wins ("Total tax" is tax).
 */
function classifyKeyword(text: string): TotalsKey | null {
  let best: { key: TotalsKey; index: number } | null = null;
  const subtotalSpans: [number, number][] = [];
  for (const { key, re } of KEYWORDS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (key === "subtotalCents") subtotalSpans.push([start, end]);
      else if (key === "totalCents" && subtotalSpans.some(([s, e]) => start >= s && end <= e)) continue;
      if (QUALIFIER_BEFORE_RE.test(text.slice(0, start))) continue;
      if (best === null || start > best.index) best = { key, index: start };
    }
  }
  return best?.key ?? null;
}

// ---------------------------------------------------------------------------------------
// Quantity forms and name cleanup
// ---------------------------------------------------------------------------------------

/** A quantity of 1–3 digits that is at least 1. */
function readQty(s: string): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

interface NameQty {
  name: string;
  quantity: number;
}

/** `2 x Foo`, `2x Foo`, `Foo x2`, `Foo (2)`, `2 Foo` (tried in that order); else quantity 1. */
function splitQuantity(rest: string): NameQty {
  const forms: [RegExp, number, number][] = [
    [/^(\d{1,3})\s*[x×]\s+(.+)$/iu, 1, 2], // 2 x Foo, 2x Foo (with a space)
    [/^(\d{1,3})[x×](\S.*)$/iu, 1, 2], // 2xFoo
    [/^(.+?)\s+[x×]\s?(\d{1,3})$/iu, 2, 1], // Foo x2, Foo x 2
    [/^(.+?)\s*\((\d{1,3})\)$/u, 2, 1], // Foo (2)
    [/^(\d{1,3})\s+(.+)$/u, 1, 2], // 2 Foo
  ];
  for (const [re, qtyGroup, nameGroup] of forms) {
    const m = re.exec(rest);
    if (!m) continue;
    const quantity = readQty(m[qtyGroup]);
    if (quantity !== null) return { name: m[nameGroup], quantity };
  }
  return { name: rest, quantity: 1 };
}

const EDGE_JUNK_RE = /^[\s.:;,|*~_=+#>•·…\-–—]+|[\s.:;,|*~_=+#>•·…\-–—]+$/gu;

/**
 * Trim, collapse whitespace, strip dot leaders and stray edge punctuation, and drop
 * standalone item codes (runs of 6+ digits, e.g. a big-box SKU or UPC) together with the
 * T/F tax flag that often follows one ("MILK 2% GAL 007874235187 F").
 */
function cleanName(raw: string): string {
  return raw
    .replace(/\.{2,}|…+|_{2,}|-{2,}/gu, " ")
    .replace(/(?<!\S)\d{6,}(?:\s+[TFtf])?(?!\S)/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(EDGE_JUNK_RE, "")
    .trim();
}

function letterCount(s: string): number {
  return (s.match(/\p{L}/gu) ?? []).length;
}

const DATE_OR_TIME_RE = /\b\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}:\d{2}\b/u;

// ---------------------------------------------------------------------------------------
// parseReceipt
// ---------------------------------------------------------------------------------------

/**
 * Parse pasted receipt text (spec §6). `opts.minorDigits` is the bill currency's minor-unit
 * digits (2 for USD, 0 for JPY); it defaults to 2. Line numbers are 1-based. Blank lines
 * are skipped silently; every other line lands in exactly one of `items` or `ignored`.
 *
 * Never throws: a non-string `text` is read as empty.
 */
export function parseReceipt(text: string, opts?: { minorDigits?: number }): ParsedReceipt {
  const result: ParsedReceipt = { items: [], totals: {}, ignored: [] };
  const source = typeof text === "string" ? text : "";
  const { currency, digits } = currencyForDigits(opts?.minorDigits);
  const lines = source.split(/\r\n|\r|\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const original = lines[i];
    const line = original.replace(/[\t  -​　]/gu, " ").trim();
    if (line === "") continue;
    const ignore = (reason: IgnoredReason) => result.ignored.push({ line: lineNo, text: line, reason });
    // No receipt line is this long; refusing it keeps every regex below linear-time cheap.
    if (line.length > MAX_LINE_LENGTH) {
      ignore("noise");
      continue;
    }

    const price = readTrailingPrice(line, digits, currency);
    const rest = price === null ? line : line.slice(0, price.start).trim();
    // Keyword matching reads OCR's letter-zero confusion as the letter ("T0TAL", "SUBT0TAL").
    const words = rest.replace(/(?<=\p{L})0|0(?=\p{L})/gu, "o");

    // Payment lines are ignored whether or not they carry an amount ("VISA 45.67", "Change 4.33").
    if (PAYMENT_RE.test(words)) {
      ignore("payment");
      continue;
    }
    if (price === null) {
      ignore("no_price");
      continue;
    }

    const keyword = classifyKeyword(words);
    if (keyword !== null) {
      // First printed value wins; keyword lines are never items.
      if (result.totals[keyword] === undefined && price.cents >= 0) result.totals[keyword] = price.cents;
      ignore("total");
      continue;
    }

    // `2 @ 6.00  12.00`: the line total wins. `2 @ 6.00`: quantity × unit.
    let quantity: number;
    let name: string;
    let priceCents = price.cents;
    const atWithTotal = /(?<!\S)(\d{1,3})\s*@\s*(?:[$€£¥]\s?)?[\d,]+(?:\.\d+)?(?:\s*(?:ea|each|\/ea))?(?!\S)/iu.exec(rest);
    const atBare = /(?<!\S)(\d{1,3})\s*@\s*$/u.exec(rest);
    if (atBare && readQty(atBare[1]) !== null) {
      quantity = readQty(atBare[1]) as number;
      name = rest.slice(0, atBare.index);
      priceCents = quantity * price.cents;
      if (!Number.isSafeInteger(priceCents) || Math.abs(priceCents) > MAX_CENTS) {
        ignore("noise");
        continue;
      }
    } else if (atWithTotal && readQty(atWithTotal[1]) !== null) {
      quantity = readQty(atWithTotal[1]) as number;
      name = rest.slice(0, atWithTotal.index) + " " + rest.slice(atWithTotal.index + atWithTotal[0].length);
    } else {
      ({ name, quantity } = splitQuantity(cleanName(rest)));
    }

    name = cleanName(name);
    const letters = letterCount(name);
    if (letters === 0) {
      ignore("noise");
      continue;
    }

    const low = letters < 2 || quantity > MAX_PLAUSIBLE_QUANTITY || DATE_OR_TIME_RE.test(rest);
    const item: DraftItem = { name, quantity, priceCents, line: lineNo, confidence: low ? "low" : "high" };
    result.items.push(item);
  }

  return result;
}
