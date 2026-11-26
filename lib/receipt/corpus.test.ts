// Corpus test: runs every lib/receipt/fixtures/<name>.txt through parseReceipt and compares
// it with <name>.expected.json, a hand-checked `{ opts, parsed }` pair.
//
// On a mismatch the first assertion compares one rendered string per source line
// ("L12  item    2 × "Steak Frites" = 5800 (high)"), so the failure reads as a per-line diff
// of what changed, rather than a wall of JSON.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ParsedReceipt } from "@/lib/types";
import { parseReceipt } from "./parse";

const FIXTURES = join(import.meta.dirname, "fixtures");

interface Expected {
  opts?: { minorDigits?: number };
  parsed: ParsedReceipt;
}

/** One line of text per source line that produced an item or an ignored entry, in line order. */
function renderByLine(parsed: ParsedReceipt): string[] {
  const rows: [number, string][] = [
    ...parsed.items.map(
      (it): [number, string] => [
        it.line,
        `L${it.line}\titem\t${it.quantity} × ${JSON.stringify(it.name)} = ${it.priceCents} (${it.confidence})`,
      ],
    ),
    ...parsed.ignored.map((ig): [number, string] => [ig.line, `L${ig.line}\t${ig.reason}\t${JSON.stringify(ig.text)}`]),
  ];
  return rows.sort((a, b) => a[0] - b[0]).map(([, s]) => s);
}

const names = readdirSync(FIXTURES)
  .filter((f) => f.endsWith(".txt"))
  .map((f) => f.slice(0, -".txt".length))
  .sort();

describe("receipt corpus", () => {
  it("has at least 8 fixtures, each with an expected JSON", () => {
    expect(names.length).toBeGreaterThanOrEqual(8);
    const expectedFiles = new Set(readdirSync(FIXTURES).filter((f) => f.endsWith(".expected.json")));
    for (const name of names) expect(expectedFiles, `${name}.expected.json`).toContain(`${name}.expected.json`);
  });

  describe.each(names)("%s", (name) => {
    const text = readFileSync(join(FIXTURES, `${name}.txt`), "utf8");
    const expected = JSON.parse(readFileSync(join(FIXTURES, `${name}.expected.json`), "utf8")) as Expected;
    const actual = parseReceipt(text, expected.opts);

    it("matches line by line", () => {
      expect(renderByLine(actual)).toEqual(renderByLine(expected.parsed));
    });

    it("detects the printed totals", () => {
      expect(actual.totals).toEqual(expected.parsed.totals);
    });

    it("matches the expected JSON exactly", () => {
      expect(actual).toEqual(expected.parsed);
    });
  });
});
