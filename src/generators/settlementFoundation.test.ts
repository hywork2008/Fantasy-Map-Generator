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
    f: new Uint16Array(count),
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
    // Footprint is ~30% of habitable capacity (20 cells × 10).
    expect(result.settledCapacity).toBeCloseTo(result.totalCapacity * 0.3, 5);
    expect(result.settledCellCount).toBe(6);
    // Settled cells start at 60% of K, not 100% (saturation ≈ footprint).
    expect(result.totalPopulation).toBeCloseTo(result.settledCapacity * 0.6, 5);
    expect(result.totalPopulation).toBeCloseTo(result.totalCapacity * 0.18, 5);
    expect(cells.pop[4]).toBeCloseTo(cells.capacity[4] * 0.6, 5);
    expect(result.plan.regions[0].cells[0]).toBe(4);
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
    // rankCells would leave true desert with s/capacity 0; only the river corridor stays habitable.
    for (let i = 0; i < 16; i++) {
      if (i === 7) continue;
      cells.s[i] = 0;
      cells.capacity[i] = 0;
    }
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
  });

  it("grows temperate hinterland around resource cores instead of only river cells", () => {
    const cells = createCells(101, [50]);
    // Moderate rain: river is the resource core; hinterland is claimable countryside.
    const precipitation = new Uint8Array(101).fill(30);
    const result = createSettlementFoundation(
      cells,
      { temperature: new Int8Array(101).fill(14), precipitation },
      "frontier",
      0.3,
      () => 0
    );

    expect(result.plan.regions).toHaveLength(1);
    expect(result.plan.regions[0].center).toBe(50);
    // ~30% of habitable capacity, contiguous around the river — not a single cell and not the whole line.
    expect(result.settledCellCount).toBeGreaterThan(10);
    expect(result.settledCellCount).toBeLessThan(50);
    expect(result.settledCapacity / result.totalCapacity).toBeGreaterThan(0.2);
    expect(result.settledCapacity / result.totalCapacity).toBeLessThanOrEqual(0.35);
    expect(cells.pop[0]).toBe(0);
    expect(cells.pop[100]).toBe(0);
  });

  it("opens one distant homeland per polity under dispersed frontier spacing", () => {
    const cells = createCells(101, [5, 50, 95]);
    const climate = { temperature: new Int8Array(101).fill(14), precipitation: new Uint8Array(101).fill(60) };
    const clustered = createSettlementFoundation(cells, climate, "frontier", 0.3, () => 0, 0, undefined, "clustered");
    const dispersed = createSettlementFoundation(
      createCells(101, [5, 50, 95]),
      climate,
      "frontier",
      0.3,
      () => 0,
      3,
      undefined,
      "dispersed"
    );

    expect(clustered.plan.regions).toHaveLength(1);
    expect(dispersed.plan.regions).toHaveLength(3);
    const centers = dispersed.plan.regions.map(region => region.center);
    expect(Math.max(...centers) - Math.min(...centers)).toBeGreaterThan(70);
  });

  it("seeds dispersed seaborne homelands from separate coastal resource regions", () => {
    const cells = createCells(101, [5, 50, 95]);
    for (const cellId of [5, 50, 95]) {
      cells.harbor[cellId] = 1;
      cells.t[cellId] = 1;
    }

    const result = createSettlementFoundation(
      cells,
      { temperature: new Int8Array(101).fill(14), precipitation: new Uint8Array(101).fill(60) },
      "frontier",
      0.3,
      () => 0,
      3,
      undefined,
      "dispersed",
      "seaborne"
    );

    expect(result.plan.regions).toHaveLength(3);
    expect(result.plan.regions.map(region => region.center).sort((a, b) => a - b)).toEqual([5, 50, 95]);
    const regionSizes = result.plan.regions.map(region => region.cells.length);
    expect(Math.max(...regionSizes) - Math.min(...regionSizes)).toBeLessThan(8);
  });

  it("treats separate land features as independent frontier expansion fields", () => {
    const cells = createCells(101, [5, 50, 95]);
    // The two continental coasts are visually close around cells 5 and 50,
    // but moving people between them requires a sea crossing.
    cells.f.fill(1, 0, 30);
    cells.f.fill(2, 30);
    for (const cellId of [5, 50, 95]) {
      cells.harbor[cellId] = 1;
      cells.t[cellId] = 1;
    }

    const result = createSettlementFoundation(
      cells,
      { temperature: new Int8Array(101).fill(14), precipitation: new Uint8Array(101).fill(60) },
      "frontier",
      0.3,
      () => 0,
      2,
      undefined,
      "dispersed",
      "seaborne",
      new Set([5, 50, 95])
    );

    expect(result.plan.regions.map(region => region.center)).toContain(5);
    expect(result.plan.regions.map(region => region.center)).toContain(50);
  });

  it("uses the largest-island allocation order before opening a second homeland", () => {
    const cells = createCells(101, [5, 30, 50, 95]);
    cells.f.fill(1, 0, 40);
    cells.f.fill(2, 40, 75);
    cells.f.fill(3, 75);
    for (const cellId of [5, 30, 50, 95]) {
      cells.harbor[cellId] = 1;
      cells.t[cellId] = 1;
    }

    const result = createSettlementFoundation(
      cells,
      { temperature: new Int8Array(101).fill(14), precipitation: new Uint8Array(101).fill(60) },
      "frontier",
      0.3,
      () => 0,
      4,
      undefined,
      "dispersed",
      "seaborne",
      new Set([5, 30, 50, 95]),
      [1, 2, 3, 1]
    );

    expect(result.plan.regions.map(region => region.center)).toEqual([5, 50, 95, 30]);
  });

  it("honors the additional regional hubs requested by high polity density", () => {
    const cells = createCells(101, [5]);
    const result = createSettlementFoundation(
      cells,
      { temperature: new Int8Array(101).fill(14), precipitation: new Uint8Array(101).fill(60) },
      "frontier",
      0.3,
      () => 0,
      5
    );

    expect(result.plan.regions).toHaveLength(5);
    const centers = result.plan.regions.map(region => region.center);
    expect(Math.max(...centers) - Math.min(...centers)).toBeGreaterThan(80);
  });

  it("settles a clearly larger share under marches than frontier at the same seed", () => {
    const climate = { temperature: new Int8Array(200).fill(14), precipitation: new Uint8Array(200).fill(35) };
    const frontier = createSettlementFoundation(createCells(200, [40, 120]), climate, "frontier", 0.3, () => 0.1);
    const marches = createSettlementFoundation(createCells(200, [40, 120]), climate, "marches", 0.45, () => 0.1, 6);

    expect(marches.settledCapacity / marches.totalCapacity).toBeGreaterThan(
      frontier.settledCapacity / frontier.totalCapacity + 0.08
    );
    expect(marches.settledCellCount).toBeGreaterThan(frontier.settledCellCount);
    expect(marches.plan.regions.length).toBeGreaterThanOrEqual(frontier.plan.regions.length);
  });
});
