import { describe, expect, it } from "vitest";
import { SHEET_PARAM, withSheet, withoutSheet } from "./sheetParam";

describe("withSheet", () => {
  it("adds the param to an empty search", () => {
    expect(withSheet("", "split-item")).toBe("?sheet=split-item");
  });

  it("tolerates a bare ? as empty", () => {
    expect(withSheet("?", "split-item")).toBe("?sheet=split-item");
  });

  it("preserves the params already there", () => {
    expect(withSheet("?view=compact&filter=open", "tip")).toBe(
      "?view=compact&filter=open&sheet=tip"
    );
  });

  it("replaces an existing sheet rather than appending a second one", () => {
    expect(withSheet("?sheet=split-item", "tip")).toBe("?sheet=tip");
  });

  it("round-trips a value that needs encoding", () => {
    const search = withSheet("?place=San%20Jos%C3%A9", "paste");
    expect(new URLSearchParams(search).get("place")).toBe("San José");
    expect(new URLSearchParams(search).get(SHEET_PARAM)).toBe("paste");
  });
});

describe("withoutSheet", () => {
  it("removes the param and keeps the rest", () => {
    expect(withoutSheet("?view=compact&sheet=tip")).toBe("?view=compact");
  });

  it("returns an empty string when nothing is left", () => {
    expect(withoutSheet("?sheet=tip")).toBe("");
  });

  it("is a no-op when there is no sheet param", () => {
    expect(withoutSheet("?view=compact")).toBe("?view=compact");
    expect(withoutSheet("")).toBe("");
  });
});
