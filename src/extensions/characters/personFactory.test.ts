import { describe, expect, it } from "vitest";
import { getUnmarriedChance } from "./personFactory";

describe("getUnmarriedChance", () => {
  it("uses a 20% permanent-unmarried baseline for established ordinary adults", () => {
    expect(getUnmarriedChance(40, "ordinary", false)).toBe(0.2);
  });

  it("keeps dynastic rulers far more likely to be married", () => {
    expect(getUnmarriedChance(40, "dynastic", false)).toBe(0.03);
  });

  it("models late marriage before the late twenties", () => {
    expect(getUnmarriedChance(22, "ordinary", false)).toBe(0.45);
  });

  it("retains the clerical celibacy rate for religious roles", () => {
    expect(getUnmarriedChance(40, "dynastic", true)).toBe(0.2);
  });
});
