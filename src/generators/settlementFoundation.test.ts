import { describe, expect, it } from "vitest";
import { createSettlementFoundation } from "./settlementFoundation";

function createCells(count: number, riverCells: readonly number[] = [4]) {
  const riverSet = new Set(riverCells);
  return {
    i: Uint16Array.from({ length: count }, (_, index) => index),
    c: Array.from({ length: count }, (_, index) =>
      [index - 1, index + 1].filter(neighbor => neighbor >= 0 && neighbor < count)
    ),
    s: Int16Array.from({ length: count }, () => 10),
    capacity: Float32Array.from({ length: count }, () => 10),
    h: Uint8Array.from({ length: count }, () => 25),
    p: Array.from({ length: count }, (_, index) => [index, 0] as [number, number]),
    r: Uint16Array.from({ length: count }, (_, index) => (riverSet.has(index) ? 1 : 0)),
    harbor: new Uint8Array(count),
    t: new Int8Array(count),
    conf: new Uint16Array(count),
    danger: new Uint8Array(count),
    g: Uint16Array.from({ length: count }, (_, index) => index),
    pop: new Float32Array(count),
    children: new Float32Array(count),
    maleAdults: new Float32Array(count),
    femaleAdults: new Float32Array(count),
    elders: new Float32Array(count)
  };
}

describe("Settlement Foundation Module", () => {
  it("places a compact, linked settlement region instead of ranking scattered world cells", () => {
    const cells = createCells(20, [4, 5]);
    const result = createSettlementFoundation(
      cells,
      { temperature: new Int8Array(20).fill(14), precipitation: new Uint8Array(20).fill(60) },
      "frontier",
      0.3,
      () => 0
    );

    expect(result.plan.regions).toHaveLength(1);
    expect(result.totalPopulation).toBeCloseTo(60, 5);
    expect(result.settledCellCount).toBe(6);
    expect(result.plan.regions[0].cells).toEqual([4, 3, 5, 2, 6, 1]);
    expect(result.plan.nodes.length).toBeGreaterThanOrEqual(2);
    expect(result.plan.links).toHaveLength(result.plan.nodes.length - 1);
    expect(
      result.plan.links.every(link => {
        const from = result.plan.nodes[link.fromNodeId];
        const to = result.plan.nodes[link.toNodeId];
        return from.regionId === to.regionId;
      })
    ).toBe(true);
  });

  it("keeps a cold, dry river as a sparse oasis rather than settling the whole basin", () => {
    const cells = createCells(16, [7]);
    const result = createSettlementFoundation(
      cells,
      { temperature: new Int8Array(16).fill(-10), precipitation: new Uint8Array(16) },
      "frontier",
      0.3,
      () => 0
    );

    expect(result.plan.regions).toHaveLength(1);
    expect(result.plan.regions[0].kind).toBe("river");
    expect(result.plan.regions[0].cells).toEqual([7]);
    expect(Array.from(cells.pop).filter(population => population > 0)).toHaveLength(1);
    expect(cells.pop[7]).toBeGreaterThan(0);
    expect(result.totalPopulation).toBeLessThan(result.totalCapacity * 0.3);
  });

  it("keeps a temperate river region local instead of following rain-fed cells across the world", () => {
    const cells = createCells(101, [50]);
    const result = createSettlementFoundation(
      cells,
      { temperature: new Int8Array(101).fill(14), precipitation: new Uint8Array(101).fill(60) },
      "frontier",
      0.3,
      () => 0
    );

    expect(result.plan.regions).toHaveLength(1);
    expect(result.plan.regions[0].center).toBe(50);
    expect(result.plan.regions[0].cells).toEqual([50, 49, 51, 48, 52, 47, 53]);
    expect(cells.pop[0]).toBe(0);
    expect(cells.pop[100]).toBe(0);
  });
});
