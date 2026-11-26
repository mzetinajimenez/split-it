import { describe, expect, it } from "vitest";
import { PERSON_COLORS, initials, nextColorIndex } from "./people";
import type { Person } from "./types";

const people = (...colors: number[]): Person[] =>
  colors.map((colorIndex, i) => ({ id: `p${i}`, name: `P${i}`, colorIndex }));

describe("initials", () => {
  it.each([
    ["Alex Kim", "AK"],
    ["blair", "B"],
    ["Mary Jane Watson", "MW"],
    ["  sam   lee  ", "SL"],
    ["", ""],
    ["   ", ""],
    ["élodie", "É"],
  ])("%j → %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it("is emoji-safe (whole graphemes, never half a surrogate pair)", () => {
    expect(initials("🍕 Pizza")).toBe("🍕P");
    expect(initials("👩‍👩‍👧 Family")).toBe("👩‍👩‍👧F");
    expect(initials("👍🏽")).toBe("👍🏽");
    expect(initials("🇯🇵 Kenji")).toBe("🇯🇵K");
  });
});

describe("nextColorIndex", () => {
  it("has 8 colours", () => {
    expect(PERSON_COLORS).toBe(8);
  });

  it("picks the lowest unused index", () => {
    expect(nextColorIndex([])).toBe(0);
    expect(nextColorIndex(people(0))).toBe(1);
    expect(nextColorIndex(people(0, 1, 2))).toBe(3);
    expect(nextColorIndex(people(1, 2))).toBe(0);
    expect(nextColorIndex(people(0, 2, 3))).toBe(1); // a removed person's colour is reused
  });

  it("wraps after 8 to the least-used colour", () => {
    expect(nextColorIndex(people(0, 1, 2, 3, 4, 5, 6, 7))).toBe(0);
    expect(nextColorIndex(people(0, 1, 2, 3, 4, 5, 6, 7, 0))).toBe(1);
    expect(nextColorIndex(people(0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7))).toBe(0);
  });

  it("always returns 0..7 and ignores out-of-range indices", () => {
    expect(nextColorIndex(people(8, -1, 99))).toBe(0);
    let list: Person[] = [];
    for (let i = 0; i < 30; i++) {
      const c = nextColorIndex(list);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(PERSON_COLORS);
      expect(c).toBe(i % PERSON_COLORS);
      list = [...list, { id: `p${i}`, name: "x", colorIndex: c }];
    }
  });
});
