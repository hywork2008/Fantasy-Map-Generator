import { describe, expect, it } from "vitest";
import { getTownAleLitersPerAdultYear } from "./aleDemand";

const litres = { baseline: 48, urban: 300 };

describe("getTownAleLitersPerAdultYear", () => {
  it("gives treeless towns the country ale and rises to the town level with woodland", () => {
    expect(getTownAleLitersPerAdultYear(0, 0, 0.05, litres)).toBe(48);
    expect(getTownAleLitersPerAdultYear(0, 0.025, 0.05, litres)).toBe(174);
    expect(getTownAleLitersPerAdultYear(0, 0.4, 0.05, litres)).toBe(300);
    expect(getTownAleLitersPerAdultYear(1, 0.4, 0.05, litres)).toBe(48);
    expect(getTownAleLitersPerAdultYear(0.5, 0.4, 0.05, litres)).toBe(174);
    expect(getTownAleLitersPerAdultYear(0, 0, 0, litres)).toBe(300);
  });
});
