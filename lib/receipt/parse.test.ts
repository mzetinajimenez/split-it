import { describe, expect, it } from "vitest";
import { MAX_CENTS } from "@/lib/money";
import type { DraftItem, ParsedReceipt } from "@/lib/types";
import { parseReceipt } from "./parse";

/** mulberry32: tiny seeded PRNG (hand-rolled so the fuzz test needs no dependency). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Base seed for every randomized test. Nightly CI sets PROPERTY_SEED to a random integer to
 * explore new cases; locally and on PRs it falls back to a fixed default, so runs are
 * reproducible. A failure message names the seed: re-run with `PROPERTY_SEED=<n> npm test`.
 */
const DEFAULT_SEED = 20261125;
const BASE_SEED = (() => {
  const raw = process.env.PROPERTY_SEED?.trim();
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isSafeInteger(n) ? n : DEFAULT_SEED;
})();

/** A seeded randomized test: each gets its own stream (BASE_SEED + offset), and failures print the seed. */
function property(name: string, offset: number, body: (rand: () => number, seed: number) => void) {
  it(name, () => {
    const seed = (BASE_SEED + offset) >>> 0;
    try {
      body(mulberry32(seed), seed);
    } catch (err) {
      if (err instanceof Error) {
        err.message = `${err.message}\n  ↳ seeded property failed: reproduce with PROPERTY_SEED=${BASE_SEED} (stream seed ${seed})`;
      }
      throw err;
    }
  });
}

/** Parse a single line and return its one item, or null (asserting nothing else became an item). */
function item(line: string, minorDigits?: number): Omit<DraftItem, "line"> | null {
  const r = parseReceipt(line, minorDigits === undefined ? undefined : { minorDigits });
  expect(r.items.length).toBeLessThanOrEqual(1);
  if (r.items.length === 0) return null;
  const { line: _line, ...rest } = r.items[0];
  void _line;
  return rest;
}

function reasonOf(line: string, minorDigits?: number) {
  const r = parseReceipt(line, minorDigits === undefined ? undefined : { minorDigits });
  return r.ignored[0]?.reason ?? null;
}

describe("parseReceipt: price token", () => {
  it.each([
    ["Burger 12.00", 1200],
    ["Burger $12.00", 1200],
    ["Burger $ 12.00", 1200],
    ["Burger €12.00", 1200],
    ["Burger £12.00", 1200],
    ["Burger 12.00€", 1200],
    ["Platter 1,234.50", 123450],
    ["Platter $1,234,567.89", 123456789 > MAX_CENTS ? null : 123456789],
    ["Burger 12.00 T", 1200],
    ["Burger 12.00 F", 1200],
    ["Burger 12.00 USD", 1200],
    ["Burger\t12.00", 1200],
    ["Burger.....12.00", 1200],
    ["Burger 0.00", 0],
  ])("%j → %s", (line, cents) => {
    expect(item(line)?.priceCents ?? null).toBe(cents);
  });

  it.each([
    ["Happy hour -3.00", -300],
    ["Happy hour -$3.00", -300],
    ["Happy hour $-3.00", -300],
    ["Coupon 3.00-", -300],
  ])("a minus sign makes a negative line: %j → %s", (line, cents) => {
    expect(item(line)?.priceCents).toBe(cents);
  });

  it.each([
    "Burger 12", // USD needs the minor digits
    "Burger 12.5",
    "Burger 12.505",
    "Burger 12,50", // decimal comma: out of scope, a seam for later
    "Burger 1,23.00", // malformed grouping
    "Burger --3.00",
    "Burger12.00", // glued to the name: not a token
    "Burger 7.5O", // OCR letter O
  ])("%j has no price", (line) => {
    expect(item(line)).toBeNull();
    expect(reasonOf(line)).toBe("no_price");
  });

  it("reads 0 minor digits (JPY): integers, ¥, thousands, 円", () => {
    expect(item("Ramen 980", 0)?.priceCents).toBe(980);
    expect(item("Ramen ¥1,280", 0)?.priceCents).toBe(1280);
    expect(item("ラーメン 980円", 0)?.priceCents).toBe(980);
    expect(item("Ramen ¥980 JPY", 0)?.priceCents).toBe(980);
    expect(item("Ramen 9.80", 0)).toBeNull();
  });

  it("reads 3 minor digits (KWD)", () => {
    expect(item("Machboos 2.750", 3)?.priceCents).toBe(2750);
    expect(item("Machboos 2.75", 3)).toBeNull();
  });

  it("falls back to 2 minor digits for an unsupported count", () => {
    for (const minorDigits of [1, -1, 2.5, Number.NaN, 99]) {
      expect(item("Burger 12.00", minorDigits)?.priceCents).toBe(1200);
    }
  });

  it("rejects an amount above MAX_CENTS", () => {
    expect(item("Yacht 1,000,000.00")).toBeNull();
  });
});

describe("parseReceipt: quantity forms", () => {
  it.each([
    ["2 x Burger 24.00", "Burger", 2, 2400],
    ["2 X Burger 24.00", "Burger", 2, 2400],
    ["2 × Burger 24.00", "Burger", 2, 2400],
    ["2x Burger 24.00", "Burger", 2, 2400],
    ["2xBurger 24.00", "Burger", 2, 2400],
    ["2 Burger 24.00", "Burger", 2, 2400],
    ["Burger x2 24.00", "Burger", 2, 2400],
    ["Burger x 2 24.00", "Burger", 2, 2400],
    ["Burger (2) 24.00", "Burger", 2, 2400],
    ["Burger 2 @ 6.00  12.00", "Burger", 2, 1200], // the line total wins
    ["Burger 2 @ 6.00  13.00", "Burger", 2, 1300], // even when it disagrees
    ["2 @ 6.00 Burger 12.00", "Burger", 2, 1200],
    ["Burger 2 @ $6.00 ea 12.00", "Burger", 2, 1200],
    ["Burger 2 @ 6.00", "Burger", 2, 1200], // no total: qty × unit
    ["Burger 3@4.50", "Burger", 3, 1350],
    ["Burger 24.00", "Burger", 1, 2400],
  ])("%j → %s × %s = %s", (line, name, quantity, priceCents) => {
    expect(item(line)).toEqual({ name, quantity, priceCents, confidence: "high" });
  });

  it("does not read 0 as a quantity", () => {
    expect(item("0 x Burger 24.00")).toMatchObject({ name: "0 x Burger", quantity: 1 });
  });

  it("qty × unit that overflows MAX_CENTS is noise, not an item", () => {
    expect(item("Gold 999 @ 999,999.00")).toBeNull();
    expect(reasonOf("Gold 999 @ 999,999.00")).toBe("noise");
  });
});

describe("parseReceipt: keyword lines fill totals", () => {
  it.each([
    ["Subtotal 45.00", "subtotalCents"],
    ["SUB-TOTAL 45.00", "subtotalCents"],
    ["Sub Total 45.00", "subtotalCents"],
    ["Tax 3.71", "taxCents"],
    ["Sales Tax 8.875% 3.71", "taxCents"],
    ["Taxes & Fees 3.71", "taxCents"],
    ["VAT 20% 3.71", "taxCents"],
    ["GST 3.71", "taxCents"],
    ["HST 13% 3.71", "taxCents"],
    ["Tip 9.00", "tipCents"],
    ["Gratuity 18% 9.00", "tipCents"],
    ["Total 57.71", "totalCents"],
    ["GRAND TOTAL 57.71", "totalCents"],
    ["Amount Due 57.71", "totalCents"],
    ["Balance Due: $57.71", "totalCents"],
    ["T0TAL 57.71", "totalCents"], // OCR zero-for-O
    ["Total incl. tax 57.71", "totalCents"], // a qualified keyword doesn't count
    ["Pre-tax total 45.00", "totalCents"],
    ["Total tax 3.71", "taxCents"], // otherwise the last keyword wins
  ] as const)("%j → %s", (line, key) => {
    const r = parseReceipt(line);
    expect(r.items).toEqual([]);
    expect(Object.keys(r.totals)).toEqual([key]);
    expect(r.ignored).toEqual([{ line: 1, text: line, reason: "total" }]);
  });

  it("the first printed value wins; later ones are still ignored as total", () => {
    const r = parseReceipt("Total 10.00\nTotal 99.00");
    expect(r.totals).toEqual({ totalCents: 1000 });
    expect(r.ignored.map((i) => i.reason)).toEqual(["total", "total"]);
  });

  it("a keyword line without a price is no_price (wrapped price: a seam for later)", () => {
    const r = parseReceipt("TOTAL\n57.71");
    expect(r.totals).toEqual({});
    expect(r.items).toEqual([]);
    expect(r.ignored.map((i) => i.reason)).toEqual(["no_price", "noise"]);
  });

  it("a negative keyword amount is not taken as a total", () => {
    expect(parseReceipt("Tax -1.00").totals).toEqual({});
  });
});

describe("parseReceipt: payment and noise", () => {
  it.each([
    "VISA ****1234 57.71",
    "Mastercard 57.71",
    "AMEX 57.71",
    "Cash 60.00",
    "Change 2.29",
    "Card 57.71",
    "Auth #123456",
    "Approval 00412A",
    "Tender 60.00",
    "DEBIT TEND 57.71",
  ])("%j is payment", (line) => {
    expect(reasonOf(line)).toBe("payment");
    expect(parseReceipt(line).items).toEqual([]);
  });

  it.each([
    "11/25/26",
    "11/25/2026",
    "2026-11-25",
    "7:42",
    "7:42 PM",
    "19:42:07",
    "11/25/26 7:42 PM",
    "(555) 123-4567",
    "555-123-4567",
    "Tel 555.123.4567",
    "THE COPPER KETTLE",
    "Table 14",
  ])("%j produces no item (USD and JPY)", (line) => {
    expect(parseReceipt(line).items).toEqual([]);
    expect(parseReceipt(line, { minorDigits: 0 }).items).toEqual([]);
  });

  it.each(["12.00", ". 4.00", "--- 4.00", "18% 31.68 20% 35.20"])("%j has no name: noise", (line) => {
    expect(item(line)).toBeNull();
    expect(reasonOf(line)).toBe("noise");
  });

  it("blank lines are skipped and line numbers stay 1-based", () => {
    const r = parseReceipt("\n\nBurger 12.00\r\n   \r\nFries 4.00\rHeader");
    expect(r.items.map((i) => [i.line, i.name])).toEqual([
      [3, "Burger"],
      [5, "Fries"],
    ]);
    expect(r.ignored).toEqual([{ line: 6, text: "Header", reason: "no_price" }]);
  });

  it("an absurdly long line is noise", () => {
    expect(reasonOf(`${"a".repeat(400)} 12.00`)).toBe("noise");
  });
});

describe("parseReceipt: names", () => {
  it.each([
    ["  Steak   Frites   29.00", "Steak Frites"],
    ["Burger ......... 12.00", "Burger"],
    ["Burger … 12.00", "Burger"],
    ["| Margherita Pizza ~ 16.50", "Margherita Pizza"],
    ["* Fries: 4.00", "Fries"],
    ["MILK 2% GAL 007874235187 F 3.48", "MILK 2% GAL"],
    ["Fries (large) 4.00", "Fries (large)"],
    ["Coffee box (serves 10) 2 @ 24.00 48.00", "Coffee box (serves 10)"],
  ])("%j → %j", (line, name) => {
    expect(item(line)?.name).toBe(name);
  });
});

describe("parseReceipt: confidence", () => {
  it("is low for a name under 2 letters", () => {
    expect(item("A 1.00")?.confidence).toBe("low");
    expect(item("A1 1.00")?.confidence).toBe("low");
    expect(item("AB 1.00")?.confidence).toBe("high");
  });

  it("is low for a quantity over 50", () => {
    expect(item("51 x Wings 51.00")).toMatchObject({ quantity: 51, confidence: "low" });
    expect(item("50 x Wings 50.00")).toMatchObject({ quantity: 50, confidence: "high" });
  });

  it("is low when the line looks like a date or a time", () => {
    expect(item("Pickup 11/25/26 12.00")?.confidence).toBe("low");
    expect(item("Order ready 7:42 12.00")?.confidence).toBe("low");
  });
});

describe("parseReceipt: robustness", () => {
  it("never throws on odd input", () => {
    const odd: unknown[] = [undefined, null, 42, {}, [], "", "\u0000", "￿".repeat(1000), "9".repeat(10_000), "$", "-", "@", "x", "((((", "1 @"];
    for (const input of odd) {
      expect(() => parseReceipt(input as string)).not.toThrow();
      expect(parseReceipt(input as string)).toMatchObject({ items: expect.any(Array), totals: {}, ignored: expect.any(Array) });
    }
  });

  it("is deterministic", () => {
    const text = "2 x Burger 24.00\nTax 2.00\nTotal 26.00\nVISA 26.00";
    expect(parseReceipt(text)).toEqual(parseReceipt(text));
  });

  const FRAGMENTS = [
    "Burger", "2 x ", "2x", " x2", " (3)", " @ ", "12.00", "$4.50", "¥1,200", "-3.00", "3.00-", "1,234.56",
    "Subtotal", "Tax", "VAT", "Tip", "Total", "Amount Due", "VISA", "Cash", "Change", "11/25/26", "7:42",
    "(555) 123-4567", ".....", "  ", "\t", "\n", "\r\n", "T", "F", "USD", "円", "0", "99", "€", "£", "|", "~",
    "生ビール", "🍔", " ", "…", "%",
  ];
  const ALPHABET = "abcXYZ0123456789 .,-$€£¥@x×()/:;|*~#\t\n";
  const DIGIT_OPTIONS = [undefined, 0, 2, 3, 1, -1, 2.5, Number.NaN];

  function randomString(rand: () => number): string {
    const parts: string[] = [];
    const n = Math.floor(rand() * 40);
    for (let i = 0; i < n; i++) {
      const pick = rand();
      if (pick < 0.5) parts.push(FRAGMENTS[Math.floor(rand() * FRAGMENTS.length)]);
      else if (pick < 0.9) parts.push(ALPHABET[Math.floor(rand() * ALPHABET.length)]);
      else parts.push(String.fromCodePoint(Math.floor(rand() * 0x10ffff) & ~0x800)); // stays clear of lone surrogates mostly
    }
    return parts.join("");
  }

  function assertValid(r: ParsedReceipt, text: string): void {
    const lineCount = text.split(/\r\n|\r|\n/).length;
    for (const it of r.items) {
      expect(typeof it.name).toBe("string");
      expect(it.name.trim()).toBe(it.name);
      expect(it.name.length).toBeGreaterThan(0);
      expect(Number.isInteger(it.quantity) && it.quantity >= 1).toBe(true);
      expect(Number.isSafeInteger(it.priceCents) && Math.abs(it.priceCents) <= MAX_CENTS).toBe(true);
      expect(Number.isInteger(it.line) && it.line >= 1 && it.line <= lineCount).toBe(true);
      expect(["high", "low"]).toContain(it.confidence);
    }
    for (const ig of r.ignored) {
      expect(["no_price", "payment", "total", "noise"]).toContain(ig.reason);
      expect(Number.isInteger(ig.line) && ig.line >= 1 && ig.line <= lineCount).toBe(true);
      expect(typeof ig.text).toBe("string");
    }
    for (const [key, cents] of Object.entries(r.totals)) {
      expect(["subtotalCents", "taxCents", "tipCents", "totalCents"]).toContain(key);
      expect(Number.isSafeInteger(cents) && (cents as number) >= 0 && (cents as number) <= MAX_CENTS).toBe(true);
    }
    // Every non-blank line lands in exactly one bucket.
    const seen = [...r.items.map((i) => i.line), ...r.ignored.map((i) => i.line)].sort((a, b) => a - b);
    expect(new Set(seen).size).toBe(seen.length);
    const nonBlank = text.split(/\r\n|\r|\n/).filter((l) => l.replace(/[\s  -​　]/gu, "") !== "").length;
    expect(seen.length).toBe(nonBlank);
  }

  property("returns a valid ParsedReceipt for 500 random strings", 9, (rand) => {
    for (let i = 0; i < 500; i++) {
      const text = randomString(rand);
      const minorDigits = DIGIT_OPTIONS[Math.floor(rand() * DIGIT_OPTIONS.length)];
      let r: ParsedReceipt;
      try {
        r = parseReceipt(text, { minorDigits });
      } catch (err) {
        throw new Error(`parseReceipt threw on case ${i} ${JSON.stringify(text)}: ${String(err)}`);
      }
      assertValid(r, text);
    }
  });
});
