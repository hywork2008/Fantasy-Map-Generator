import { describe, expect, it } from "vitest";
import { getSettlementBaseSize, getSettlementClimateScore, getSettlementWaterKind } from "./settlementSuitability";

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
  it("uses freshwater lakes for water access and keeps salt lakes and the sea distinct", () => {
    const shore = { ...cells, c: [[1], []], h: [30, 10], f: [0, 1], harbor: [1, 0] };
    const fresh = [{ type: "island" }, { type: "lake", group: "freshwater" }];
    const salt = [{ type: "island" }, { type: "lake", group: "salt" }];
    expect(getSettlementWaterKind(shore, 0, fresh)).toBe("lake");
    expect(getSettlementWaterKind(shore, 0, salt)).toBe("coast");
    expect(getSettlementBaseSize(shore, 0, [12, 12], [2, 2], fresh)).toBe(20);
    expect(getSettlementBaseSize(shore, 0, [12, 12], [2, 2], salt)).toBe(0);
  });
  it("keeps legacy terrain capacity and never exceeds its score", () => {
    expect(getSettlementBaseSize({ ...cells, subsistenceCapacity: undefined }, 1)).toBe(100);
    expect(getSettlementBaseSize({ ...cells, subsistenceCapacity: [200, 10] }, 0)).toBe(100);
  });
});
