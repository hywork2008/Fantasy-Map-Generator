import { describe, expect, it } from "vitest";
import { BASE_NET_YIELD_KG_PER_SOWN_HECTARE, getFieldLabourFeasibility } from "./settlementClearance";

describe("field labour feasibility", () => {
  it("lets residents work their own grain fields at ordinary yields but not on very poor land", () => {
    expect(getFieldLabourFeasibility(BASE_NET_YIELD_KG_PER_SOWN_HECTARE)).toBe(1);
    const poor = getFieldLabourFeasibility(100);
    expect(poor).toBeGreaterThan(0);
    expect(poor).toBeLessThan(1);
    expect(getFieldLabourFeasibility(150)).toBeGreaterThan(poor);
    expect(getFieldLabourFeasibility(0)).toBe(0);
  });
});
