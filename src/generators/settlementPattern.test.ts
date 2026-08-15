import { describe, expect, it } from "vitest";
import { applyInitialSettlementPattern } from "./settlementPattern";

function createCells(count = 12) {
  const ids = Uint16Array.from({ length: count }, (_, index) => index);
  return {
    i: ids,
    s: Int16Array.from({ length: count }, (_, index) => (index === 0 ? 0 : 10 + index)),
    capacity: Float32Array.from({ length: count }, (_, index) => (index === 0 ? 0 : 10 + index)),
    pop: new Float32Array(count),
    children: new Float32Array(count),
    maleAdults: new Float32Array(count),
    femaleAdults: new Float32Array(count),
    elders: new Float32Array(count),
    r: Uint16Array.from({ length: count }, (_, index) => (index === 3 || index === 7 ? 1 : 0)),
    harbor: Uint8Array.from({ length: count }, (_, index) => (index === 7 ? 1 : 0)),
    t: Uint8Array.from({ length: count }, (_, index) => (index % 3 === 0 ? 1 : 0)),
    p: Array.from({ length: count }, (_, index) => [index * 10, index % 2 ? 0 : 10] as [number, number])
  };
}

describe("applyInitialSettlementPattern", () => {
  it("preserves the historical standard distribution and capacity", () => {
    const cells = createCells();
    let randomCalls = 0;
    const result = applyInitialSettlementPattern(cells, "standard", 0.6, () => {
      randomCalls++;
      return 0.5;
    });

    expect(result.settledCellCount).toBe(11);
    expect(result.totalCapacity).toBe(176);
    expect(result.totalPopulation).toBeCloseTo(105.6, 5);
    expect(cells.capacity[7]).toBe(17);
    expect(cells.pop[1]).toBeCloseTo(cells.capacity[1] * 0.6, 5);
    expect(cells.pop[0]).toBe(0);
    expect(randomCalls).toBe(0);
    expect(cells.children[4] + cells.maleAdults[4] + cells.femaleAdults[4] + cells.elders[4]).toBeCloseTo(
      cells.pop[4],
      5
    );
  });

  it("creates deterministic empty suitable cells for frontier while retaining global population", () => {
    const first = createCells(40);
    const second = createCells(40);
    const result = applyInitialSettlementPattern(first, "frontier", 0.3, () => 0.5);
    applyInitialSettlementPattern(second, "frontier", 0.3, () => 0.5);

    expect(result.settledCellCount).toBeLessThan(result.suitableCellCount);
    expect(Array.from(first.pop)).toEqual(Array.from(second.pop));
    expect(result.totalPopulation).toBeCloseTo(result.settledCapacity * 0.6, 5);
    expect(result.totalPopulation).toBeLessThan(result.totalCapacity * 0.3);
    expect(first.capacity).toEqual(second.capacity);
    expect(Array.from(first.pop).filter(population => population === 0).length).toBeGreaterThan(1);
  });
});
