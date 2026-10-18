import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { PackedGraph } from "../types/PackedGraph";
import { simulateDemographics } from "./demography-simulator";
import { resetPopulationLossTracker } from "./populationLossTracker";

/**
 * Cold mortality driven by burg.coldExposure — a town that cannot buy or find its fuel.
 * Design: docs/plan/farm-labour-calibration.md §23.
 */
function baseBurgDemographics() {
  return {
    // Generous capacity so roomForGrowth stays >= 0 — isolates cold mortality from starvation.
    capacity: 100_000,
    effectiveCapacity: 100_000,
    children: 200,
    maleAdults: 300,
    femaleAdults: 400,
    elders: 100
  };
}

function makeWorld(coldExposure: number | undefined): PackedGraph {
  return {
    cells: {
      i: [],
      pop: [],
      children: [],
      maleAdults: [],
      femaleAdults: [],
      elders: [],
      capacity: [],
      state: [],
      h: [],
      s: [],
      r: [],
      c: []
    },
    burgs: [
      { i: 0, removed: 1 },
      {
        i: 1,
        cell: 0,
        x: 0,
        y: 0,
        removed: 0,
        population: 1000,
        group: "town",
        state: 1,
        coldExposure,
        demographics: baseBurgDemographics()
      }
    ],
    states: [undefined, { i: 1, name: "A" }]
  } as unknown as PackedGraph;
}

describe("simulateDemographics cold mortality", () => {
  beforeEach(() => {
    useOptionsState.setState({
      demographicBirthRate: 0,
      demographicChildMortalityRate: 0
    });
    worldContext.populationRate = 1;
    resetPopulationLossTracker();
  });

  afterEach(() => {
    useOptionsState.setState({ demographicBirthRate: 0.25, demographicChildMortalityRate: 0 });
  });

  it("does not reduce population when coldExposure is unset or 0", () => {
    worldContext.pack = makeWorld(undefined);
    const before = worldContext.pack.burgs[1]!.population!;
    simulateDemographics(1 / 12);
    expect(worldContext.pack.burgs[1]!.population).toBeCloseTo(before, 5);

    worldContext.pack = makeWorld(0);
    simulateDemographics(1 / 12);
    expect(worldContext.pack.burgs[1]!.population).toBeCloseTo(before, 5);
  });

  it("kills the old first, then children, and few working adults", () => {
    worldContext.pack = makeWorld(0);
    simulateDemographics(1 / 12);
    const warm = { ...worldContext.pack.burgs[1]!.demographics! };
    worldContext.pack = makeWorld(1);
    simulateDemographics(1 / 12);
    const cold = worldContext.pack.burgs[1]!.demographics!;

    // One fully unheated month at 0 °C: 2.5% of the old, half that of children, a tenth of adults.
    expect(1 - cold.elders / warm.elders).toBeCloseTo(0.025, 4);
    expect(1 - cold.children / warm.children).toBeCloseTo(0.0125, 4);
    expect(1 - cold.maleAdults / warm.maleAdults).toBeCloseTo(0.0025, 4);
  });
});
