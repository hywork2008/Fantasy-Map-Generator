import { describe, expect, it } from "vitest";
import { integerizeToTotal } from "./numberUtils";

describe("integerizeToTotal", () => {
  it("rounds parts to whole numbers that sum exactly to the rounded total", () => {
    // Raw manpower-style fractions (see src/generators/manpower.ts) whose sum drifted
    // slightly below the regiment's tracked total (245.83 vs a=246.1).
    const parts = [120.4, 80.2, 45.23];
    const result = integerizeToTotal(parts, 246.1);
    expect(result.reduce((s, v) => s + v, 0)).toBe(246);
    expect(result).toEqual([121, 80, 45]);
  });

  it("takes from the smallest-remainder parts when the raw sum exceeds the target", () => {
    // Sum of parts (100.9) drifted above the tracked total (100).
    const parts = [50.5, 30.3, 20.1];
    const result = integerizeToTotal(parts, 100);
    expect(result.reduce((s, v) => s + v, 0)).toBe(100);
    expect(result.every(v => v >= 0)).toBe(true);
  });

  it("never returns a negative part, and terminates, when the target is unreachably low", () => {
    const parts = [0.9, 0.9];
    const result = integerizeToTotal(parts, -3);
    expect(result).toEqual([0, 0]);
  });

  it("spreads a diff larger than the number of parts across all of them", () => {
    const parts = [5, 5];
    const result = integerizeToTotal(parts, 1);
    expect(result.reduce((s, v) => s + v, 0)).toBe(1);
    expect(result.every(v => v >= 0)).toBe(true);
  });

  it("is a no-op for already-integer parts matching the total", () => {
    const parts = [3, 5, 2];
    expect(integerizeToTotal(parts, 10)).toEqual([3, 5, 2]);
  });

  it("handles an empty parts array", () => {
    expect(integerizeToTotal([], 0)).toEqual([]);
  });
});
