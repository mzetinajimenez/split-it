import { describe, expect, it } from "vitest";
import { formatShare } from "./formatShare";

describe("formatShare", () => {
  it("uses vulgar fractions for the common cases", () => {
    expect(formatShare(1, 2)).toBe("½");
    expect(formatShare(1, 3)).toBe("⅓");
    expect(formatShare(2, 3)).toBe("⅔");
    expect(formatShare(1, 4)).toBe("¼");
  });
  it("reduces before formatting", () => {
    expect(formatShare(2, 4)).toBe("½");
    expect(formatShare(2, 6)).toBe("⅓");
  });
  it("falls back to n/d", () => {
    expect(formatShare(2, 5)).toBe("2/5");
    expect(formatShare(2, 7)).toBe("2/7");
    expect(formatShare(5, 12)).toBe("5/12");
  });
  it("returns an empty string for a whole item or bad input", () => {
    expect(formatShare(3, 3)).toBe("");
    expect(formatShare(1, 1)).toBe("");
    expect(formatShare(0, 3)).toBe("");
    expect(formatShare(1.5, 3)).toBe("");
  });
});
