import { describe, expect, it } from "vitest";
import { ownsBottomBar } from "./navRoutes";

describe("ownsBottomBar", () => {
  it.each(["/bills", "/bills/abc", "/bills/abc/split", "/s", "/s/"])("%s owns the bottom bar", (p) => {
    expect(ownsBottomBar(p)).toBe(true);
  });
  it.each(["/", "/settings", "/settings/x", "/sx", "/billsfoo"])("%s shows the global BottomNav", (p) => {
    expect(ownsBottomBar(p)).toBe(false);
  });
});
