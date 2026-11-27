import { describe, expect, it } from "vitest";
import {
  MAX_CENTS,
  allocate,
  formatBps,
  formatMoney,
  minorDigits,
  parseMoney,
  parsePercent,
  percentOf,
  toDecimalString,
} from "./money";

/** mulberry32: tiny seeded PRNG (hand-rolled so the property tests need no dependency). */
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

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

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

describe("minorDigits", () => {
  it("reads minor-unit digits from Intl", () => {
    expect(minorDigits("USD")).toBe(2);
    expect(minorDigits("EUR")).toBe(2);
    expect(minorDigits("JPY")).toBe(0);
    expect(minorDigits("KWD")).toBe(3);
    expect(minorDigits("usd")).toBe(2);
  });

  it("throws on an invalid currency code", () => {
    expect(() => minorDigits("NOPE")).toThrow(RangeError);
  });
});

describe("parseMoney", () => {
  it.each([
    ["12.5", "USD", 1250],
    ["12.50", "USD", 1250],
    ["12", "USD", 1200],
    ["12.", "USD", 1200],
    [".5", "USD", 50],
    ["0", "USD", 0],
    ["0.07", "USD", 7],
    ["$1,234.50", "USD", 123450],
    ["  $ 12.00 ", "USD", 1200],
    ["12.00 USD", "USD", 1200],
    ["usd 3", "USD", 300],
    ["€9.99", "EUR", 999],
    ["9.99 €", "EUR", 999],
    ["¥1,235", "JPY", 1235],
    ["1235", "JPY", 1235],
    ["1.234", "KWD", 1234],
    ["999,999.99", "USD", MAX_CENTS],
    ["99,999,999", "JPY", MAX_CENTS],
    ["000012.50", "USD", 1250],
  ])("%j (%s) → %d", (input, currency, expected) => {
    expect(parseMoney(input, currency)).toBe(expected);
  });

  it.each([
    ["", "USD"],
    ["   ", "USD"],
    ["abc", "USD"],
    ["$", "USD"],
    [".", "USD"],
    ["12abc", "USD"],
    ["1.234", "USD"], // too many decimals for USD
    ["1.5", "JPY"], // JPY has no minor unit
    ["-5", "USD"], // amounts are ≥ 0
    ["$-5.00", "USD"],
    ["12,50", "USD"], // malformed grouping
    ["1,23,456", "USD"],
    ["1.2.3", "USD"],
    ["1e5", "USD"],
    ["1 000", "USD"],
    ["1,000,000.00", "USD"], // > MAX_CENTS
    ["100,000,000", "JPY"],
    ["99999999999999999999999", "USD"],
  ])("%j (%s) → null", (input, currency) => {
    expect(parseMoney(input, currency)).toBeNull();
  });

  property("never returns a float (randomized)", 7, (rand) => {
    for (let i = 0; i < 2000; i++) {
      const whole = Math.floor(rand() * 1_000_000);
      const frac = String(Math.floor(rand() * 100)).padStart(2, "0");
      const input = rand() < 0.5 ? `${whole}.${frac}` : `${whole}.${frac[0]}`;
      const cents = parseMoney(input, "USD");
      expect(cents).not.toBeNull();
      expect(Number.isInteger(cents)).toBe(true);
    }
  });
});

describe("toDecimalString", () => {
  it("renders plain decimals from the digit string", () => {
    expect(toDecimalString(5, "USD")).toBe("0.05");
    expect(toDecimalString(123450, "USD")).toBe("1234.50");
    expect(toDecimalString(0, "USD")).toBe("0.00");
    expect(toDecimalString(-120, "USD")).toBe("-1.20");
    expect(toDecimalString(1235, "JPY")).toBe("1235");
    expect(toDecimalString(1234, "KWD")).toBe("1.234");
    expect(toDecimalString(MAX_CENTS, "USD")).toBe("999999.99");
  });
  it("rejects a non-integer", () => expect(() => toDecimalString(1.5, "USD")).toThrow(RangeError));
});

describe("formatMoney", () => {
  it("formats minor units with Intl", () => {
    expect(formatMoney(123450, "USD")).toBe("$1,234.50");
    expect(formatMoney(5, "USD")).toBe("$0.05");
    expect(formatMoney(0, "USD")).toBe("$0.00");
    expect(formatMoney(-500, "USD")).toBe("-$5.00");
    expect(formatMoney(999, "EUR")).toBe("€9.99");
    expect(formatMoney(1235, "JPY")).toBe("¥1,235");
    expect(formatMoney(1234, "KWD")).toBe("KWD\u00a01.234") // Intl puts a no-break space after a code;
    expect(formatMoney(MAX_CENTS, "USD")).toBe("$999,999.99");
  });

  it("passes signDisplay through", () => {
    expect(formatMoney(500, "USD", { signDisplay: "always" })).toBe("+$5.00");
    expect(formatMoney(-500, "USD", { signDisplay: "always" })).toBe("-$5.00");
    expect(formatMoney(0, "USD", { signDisplay: "exceptZero" })).toBe("$0.00");
    expect(formatMoney(500, "USD", { signDisplay: "exceptZero" })).toBe("+$5.00");
    // The cached "auto" formatter is unaffected by the others.
    expect(formatMoney(500, "USD")).toBe("$5.00");
  });

  it("throws on a non-integer amount", () => {
    expect(() => formatMoney(12.5, "USD")).toThrow(RangeError);
    expect(() => formatMoney(Number.NaN, "USD")).toThrow(RangeError);
  });

  for (const [c, currency] of ["USD", "EUR", "JPY"].entries()) {
    property(`round-trips with parseMoney for ${currency}`, 100 + c, (rand) => {
      const cases = [0, 1, 9, 10, 99, 100, 101, 1000, 123456, MAX_CENTS];
      for (let i = 0; i < 1000; i++) cases.push(Math.floor(rand() * (MAX_CENTS + 1)));
      for (const cents of cases) {
        expect(parseMoney(formatMoney(cents, currency), currency)).toBe(cents);
      }
    });
  }
});

describe("percentOf", () => {
  it("rounds half away from zero", () => {
    expect(percentOf(1000, 825)).toBe(83); // 82.5
    expect(percentOf(-1000, 825)).toBe(-83);
    expect(percentOf(1000, 824)).toBe(82); // 82.4
    expect(percentOf(1000, 826)).toBe(83); // 82.6
    expect(percentOf(10000, 2000)).toBe(2000);
    expect(percentOf(1, 4999)).toBe(0); // 0.4999
    expect(percentOf(1, 5000)).toBe(1); // 0.5
    expect(percentOf(-1, 5000)).toBe(-1);
    expect(percentOf(MAX_CENTS, 10000)).toBe(MAX_CENTS);
  });

  it("never returns -0", () => {
    expect(Object.is(percentOf(-1, 1), 0)).toBe(true);
    expect(Object.is(percentOf(0, 825), 0)).toBe(true);
  });

  it("throws on non-integers", () => {
    expect(() => percentOf(10.5, 825)).toThrow(RangeError);
    expect(() => percentOf(1000, 8.25)).toThrow(RangeError);
  });

  property("matches a BigInt reference (randomized)", 42, (rand) => {
    for (let i = 0; i < 2000; i++) {
      const base = Math.floor(rand() * (MAX_CENTS + 1)) * (rand() < 0.2 ? -1 : 1);
      const bps = Math.floor(rand() * 10001);
      const p = BigInt(base) * BigInt(bps);
      const abs = p < 0n ? -p : p;
      let q = abs / 10000n;
      if ((abs % 10000n) * 2n >= 10000n) q += 1n;
      expect(percentOf(base, bps)).toBe(Number(p < 0n ? -q : q));
    }
  });
});

describe("allocate", () => {
  it("handles the edge cases from spec §5.2", () => {
    expect(allocate(100, [])).toEqual([]);
    expect(allocate(100, [0, 0, 0])).toEqual([0, 0, 0]);
    expect(allocate(0, [1, 2, 3])).toEqual([0, 0, 0]);
    expect(allocate(100, [1])).toEqual([100]);
    expect(allocate(100, [1, 1])).toEqual([50, 50]);
    expect(allocate(100, [2, 1])).toEqual([67, 33]);
    expect(allocate(100, [0, 1, 0])).toEqual([0, 100, 0]);
  });

  it("explodes $20.00 into three as $6.67, $6.67, $6.66 (spec §5.7)", () => {
    expect(allocate(2000, [1, 1, 1])).toEqual([667, 667, 666]);
  });

  it("gives leftovers to the largest remainders, not by position", () => {
    // 10 × [1,2,4]/7 = 1.43, 2.86, 5.71 → floors 1,2,5 (8); rems 3,6,5 → +1 to idx 1 and 2.
    expect(allocate(10, [1, 2, 4])).toEqual([1, 3, 6]);
    // Same, but the tie-break start never overrides a strictly larger remainder.
    expect(allocate(10, [1, 2, 4], 0)).toEqual(allocate(10, [1, 2, 4], 2));
  });

  it("rotates the penny with startIndex", () => {
    expect(allocate(1, [1, 1, 1], 0)).toEqual([1, 0, 0]);
    expect(allocate(1, [1, 1, 1], 1)).toEqual([0, 1, 0]);
    expect(allocate(1, [1, 1, 1], 2)).toEqual([0, 0, 1]);
    // Wraps, and tolerates indices ≥ n and negative indices.
    expect(allocate(1, [1, 1, 1], 3)).toEqual([1, 0, 0]);
    expect(allocate(1, [1, 1, 1], 7)).toEqual([0, 1, 0]);
    expect(allocate(1, [1, 1, 1], -1)).toEqual([0, 0, 1]);
    // Two leftover units go to startIndex and the one after it.
    expect(allocate(2, [1, 1, 1], 2)).toEqual([1, 0, 1]);
  });

  it("lands a 1¢ penny on a different person for each startIndex", () => {
    const winners = [0, 1, 2].map((s) => allocate(1, [1, 1, 1], s).indexOf(1));
    expect(new Set(winners).size).toBe(3);
  });

  it("skips zero weights in the tie-break rotation", () => {
    expect(allocate(1, [1, 0, 1], 1)).toEqual([0, 0, 1]);
    expect(allocate(3, [1, 0, 1, 1], 1)).toEqual([1, 0, 1, 1]);
  });

  it("allocates a negative amount as the negated allocation of |amount|", () => {
    expect(allocate(-100, [2, 1])).toEqual([-67, -33]);
    expect(allocate(-1, [1, 1, 1], 1)).toEqual([0, -1, 0]);
    expect(allocate(-2000, [1, 1, 1])).toEqual([-667, -667, -666]);
    for (const c of allocate(-1, [1, 1, 1])) expect(Object.is(c, -0)).toBe(false);
  });

  it("rejects invalid input instead of returning an inexact split", () => {
    expect(() => allocate(1.5, [1])).toThrow(RangeError);
    expect(() => allocate(100, [1, -1])).toThrow(RangeError);
    expect(() => allocate(100, [0.5, 0.5])).toThrow(RangeError);
    expect(() => allocate(100, [1], 0.5)).toThrow(RangeError);
    expect(() => allocate(MAX_CENTS, [Number.MAX_SAFE_INTEGER])).toThrow(RangeError);
  });

  describe("properties (seeded, mulberry32)", () => {
    const CASES = 5000;

    function randomCase(rand: () => number) {
      const n = 1 + Math.floor(rand() * 12);
      const weights = Array.from({ length: n }, () => {
        const r = rand();
        if (r < 0.2) return 0;
        if (r < 0.6) return 1 + Math.floor(rand() * 99); // shares
        return Math.floor(rand() * 500_000); // subtotals
      });
      const magnitude = rand() < 0.5 ? Math.floor(rand() * 100) : Math.floor(rand() * (MAX_CENTS + 1));
      const amount = rand() < 0.25 && magnitude > 0 ? -magnitude : magnitude;
      const startIndex = Math.floor(rand() * 3 * n);
      return { amount, weights, startIndex };
    }

    property("Σ allocate(a, w) === a (when W > 0)", 1, (rand) => {
      for (let i = 0; i < CASES; i++) {
        const { amount, weights, startIndex } = randomCase(rand);
        const result = allocate(amount, weights, startIndex);
        expect(result).toHaveLength(weights.length);
        expect(sum(result)).toBe(sum(weights) === 0 ? 0 : amount);
        for (const c of result) expect(Number.isSafeInteger(c)).toBe(true);
      }
    });

    property("|share_i − a·w_i/W| < 1", 2, (rand) => {
      for (let i = 0; i < CASES; i++) {
        const { amount, weights, startIndex } = randomCase(rand);
        const W = sum(weights);
        if (W === 0) continue;
        const result = allocate(amount, weights, startIndex);
        // Exact check in BigInt: |share·W − a·w| < W.
        weights.forEach((w, j) => {
          const diff = BigInt(result[j]) * BigInt(W) - BigInt(amount) * BigInt(w);
          expect((diff < 0n ? -diff : diff) < BigInt(W)).toBe(true);
        });
      }
    });

    property("zero weight → 0", 3, (rand) => {
      for (let i = 0; i < CASES; i++) {
        const { amount, weights, startIndex } = randomCase(rand);
        const result = allocate(amount, weights, startIndex);
        weights.forEach((w, j) => {
          if (w === 0) expect(result[j]).toBe(0);
        });
      }
    });

    property("is deterministic", 4, (a, seed) => {
      const b = mulberry32(seed);
      for (let i = 0; i < CASES; i++) {
        const x = randomCase(a);
        const y = randomCase(b);
        expect(allocate(x.amount, x.weights, x.startIndex)).toEqual(allocate(y.amount, y.weights, y.startIndex));
        expect(allocate(x.amount, [...x.weights], x.startIndex)).toEqual(allocate(x.amount, x.weights, x.startIndex));
      }
    });

    property("spreads equal-split leftovers by rotation (no person gets 2 more than another)", 5, (rand) => {
      for (let i = 0; i < 1000; i++) {
        const n = 2 + Math.floor(rand() * 7);
        const totals = new Array<number>(n).fill(0);
        for (let item = 0; item < 3 * n; item++) {
          allocate(1, new Array<number>(n).fill(1), item).forEach((c, j) => (totals[j] += c));
        }
        expect(Math.max(...totals) - Math.min(...totals)).toBe(0);
      }
    });
  });
});

describe("formatBps", () => {
  it.each([
    [825, "8.25%"],
    [2000, "20%"],
    [1250, "12.5%"],
    [5, "0.05%"],
    [0, "0%"],
    [10000, "100%"],
    [-825, "-8.25%"],
  ])("%d → %s", (bps, expected) => {
    expect(formatBps(bps)).toBe(expected);
  });
});

describe("parsePercent", () => {
  it.each([
    ["8.25", 825],
    ["8.25%", 825],
    [" 8.25 % ", 825],
    ["20", 2000],
    ["12.5", 1250],
    [".5", 50],
    ["0", 0],
    ["100", 10000],
    ["007", 700],
  ])("%j → %d", (input, expected) => {
    expect(parsePercent(input)).toBe(expected);
  });

  it.each(["", "%", "abc", "-5", "8.255", "100.01", "101", "1e2", "8,25"])("%j → null", (input) => {
    expect(parsePercent(input)).toBeNull();
  });

  it("round-trips with formatBps", () => {
    for (let bps = 0; bps <= 10000; bps++) expect(parsePercent(formatBps(bps))).toBe(bps);
  });
});
