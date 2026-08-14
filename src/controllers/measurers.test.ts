import { describe, expect, it } from "vitest";
import { canRemoveRulerPoint } from "./measurers";

describe("canRemoveRulerPoint", () => {
  it("keeps both endpoints of a two-point ruler", () => {
    expect(canRemoveRulerPoint(2, 0)).toBe(false);
    expect(canRemoveRulerPoint(2, 1)).toBe(false);
  });

  it("allows only intermediate points", () => {
    expect(canRemoveRulerPoint(4, 0)).toBe(false);
    expect(canRemoveRulerPoint(4, 1)).toBe(true);
    expect(canRemoveRulerPoint(4, 2)).toBe(true);
    expect(canRemoveRulerPoint(4, 3)).toBe(false);
  });

  it("refuses deletion when a ruler has fewer than two points", () => {
    expect(canRemoveRulerPoint(1, 0)).toBe(false);
    expect(canRemoveRulerPoint(0, 0)).toBe(false);
  });
});
