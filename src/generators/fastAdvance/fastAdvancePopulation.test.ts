import { beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../context/worldContext";
import type { Burg } from "../../types/models";
import type { PackedGraph } from "../../types/PackedGraph";
import { createRNGService } from "../../utils/probabilityUtils";
import { applyFastForwardPopulation } from "./fastAdvancePopulation";
import { FAST_ADVANCE_PRESETS } from "./fastAdvancePresets";

function makePack(): PackedGraph {
  const cells = {
    i: [0, 1, 2],
    pop: [0, 100, 50],
    maleAdults: new Float32Array([0, 22, 11]),
    femaleAdults: new Float32Array([0, 23, 12]),
    children: new Float32Array([0, 40, 20]),
    elders: new Float32Array([0, 15, 7])
  };
  const burgs: Burg[] = [
    { cell: 0, x: 0, y: 0 },
    { i: 1, cell: 1, x: 1, y: 1, state: 1, population: 200 },
    { i: 2, cell: 2, x: 2, y: 2, state: 1, population: 0 },
    { i: 3, cell: 3, x: 3, y: 3, state: 1, population: 50, removed: true }
  ];
  return { cells, burgs, states: [{ i: 0 }, { i: 1 }] } as unknown as PackedGraph;
}

const NO_JITTER_RNG = createRNGService(() => 0.5); // rand()*2-1 === 0

describe("applyFastForwardPopulation", () => {
  beforeEach(() => {
    worldContext.pack = makePack();
  });

  it("grows rural cell cohorts and burg population by the preset's annual rate with no jitter", () => {
    const rates = { ...FAST_ADVANCE_PRESETS.steady, variancePct: 0 };
    const result = applyFastForwardPopulation(2, rates, NO_JITTER_RNG);

    const growth = (1 + rates.populationGrowthPctPerYear / 100) ** 2;
    const pack = worldContext.pack as PackedGraph;
    // Float32Array-backed cell cohorts only carry ~7 significant digits.
    expect(pack.cells.maleAdults[1]).toBeCloseTo(22 * growth, 3);
    expect(pack.cells.femaleAdults[1]).toBeCloseTo(23 * growth, 3);
    expect(pack.cells.children[1]).toBeCloseTo(40 * growth, 3);
    expect(pack.cells.elders[1]).toBeCloseTo(15 * growth, 3);
    expect(pack.burgs[1]?.population).toBeCloseTo(200 * growth, 6);

    // Returns the same empty-result shape simulateDemographics() would for a no-op tick — Fast
    // Forward never grows new burgs, shifts borders, or adds routes.
    expect(result).toEqual({
      bordersChanged: false,
      newBurgsAdded: false,
      routesAdded: false,
      promotedSettlements: []
    });
  });

  it("skips cells/burgs with zero, negative, or missing population", () => {
    const rates = { ...FAST_ADVANCE_PRESETS.steady, variancePct: 0 };
    applyFastForwardPopulation(5, rates, NO_JITTER_RNG);

    const pack = worldContext.pack as PackedGraph;
    expect(pack.cells.maleAdults[0]).toBe(0); // cell 0 had pop 0, left untouched
    expect(pack.burgs[2]?.population).toBe(0); // burg 2 had population 0
    expect(pack.burgs[3]?.population).toBe(50); // burg 3 is removed, untouched
  });

  it("is a no-op for zero or negative deltaYears", () => {
    const rates = FAST_ADVANCE_PRESETS.steady;
    applyFastForwardPopulation(0, rates, NO_JITTER_RNG);
    const pack = worldContext.pack as PackedGraph;
    expect(pack.cells.maleAdults[1]).toBe(22);
    expect(pack.burgs[1]?.population).toBe(200);
  });

  it("applies a Collapse preset's negative growth rate as shrinkage, never going negative", () => {
    const rates = { ...FAST_ADVANCE_PRESETS.collapse, variancePct: 0 };
    applyFastForwardPopulation(50, rates, NO_JITTER_RNG);
    const pack = worldContext.pack as PackedGraph;
    expect(pack.burgs[1]?.population).toBeGreaterThanOrEqual(0);
    expect(pack.burgs[1]?.population).toBeLessThan(200);
  });

  it("is deterministic: the same rng stream applied twice from the same starting state matches", () => {
    const rates = FAST_ADVANCE_PRESETS.steady;
    const rngA = createRNGService(() => 0.9);
    const rngB = createRNGService(() => 0.9);

    worldContext.pack = makePack();
    applyFastForwardPopulation(3, rates, rngA);
    const afterA = (worldContext.pack as PackedGraph).burgs[1]?.population;

    worldContext.pack = makePack();
    applyFastForwardPopulation(3, rates, rngB);
    const afterB = (worldContext.pack as PackedGraph).burgs[1]?.population;

    expect(afterA).toBe(afterB);
  });
});
