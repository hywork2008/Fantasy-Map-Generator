import { describe, expect, it } from "vitest";
import { getSettlementBaseSize, getSettlementClimateScore } from "./settlementSuitability";

describe("shared settlement food and climate", () => {
  const cells = { s: [100, 100], h: [30, 30], capacity: [100, 100], subsistenceCapacity: [100, 10], g: [1, 0] };
  it("ranks local food without borrowing from neighbouring cells", () => {
    expect(getSettlementBaseSize(cells, 0)).toBe(100);
    expect(getSettlementBaseSize(cells, 1)).toBe(10);
  });
  it("uses grid climate and excludes extreme temperatures and water", () => {
    expect(getSettlementBaseSize(cells, 0, [12, -30])).toBe(0);
    expect(getSettlementBaseSize({ ...cells, h: [10, 30] }, 0)).toBe(0);
    expect(getSettlementClimateScore(12, 2, "spring")).toBe(0);
    expect(getSettlementClimateScore(12, 2, "river")).toBe(0.2);
  });
  it("keeps legacy terrain capacity and never exceeds its score", () => {
    expect(getSettlementBaseSize({ ...cells, subsistenceCapacity: undefined }, 1)).toBe(100);
    expect(getSettlementBaseSize({ ...cells, subsistenceCapacity: [200, 10] }, 0)).toBe(100);
  });
});
