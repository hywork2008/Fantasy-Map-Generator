import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { PackedGraph } from "../types/PackedGraph";
import { simulateDemographics } from "./demography-simulator";
import { getDeathsByState, resetPopulationLossTracker } from "./populationLossTracker";

/**
 * Epidemic mortality driven by burg.waterSecurity — independent of food supply/roomForGrowth.
 * Design: docs/plan/epidemic-cholera-and-water-security.md §3.3.
 */
function baseBurgDemographics() {
  return {
    // Generous capacity so roomForGrowth stays >= 0 — isolates epidemic mortality from starvation.
    capacity: 100_000,
    effectiveCapacity: 100_000,
    children: 200,
    maleAdults: 300,
    femaleAdults: 400,
    elders: 100
  };
}

function makeWorld(waterSecurity: number | undefined): PackedGraph {
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
        waterSecurity,
        demographics: baseBurgDemographics()
      }
    ],
    states: [undefined, { i: 1, name: "A" }]
  } as unknown as PackedGraph;
}

describe("simulateDemographics epidemic mortality", () => {
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

  it("does not reduce population when waterSecurity is unset (Economy off)", () => {
    worldContext.pack = makeWorld(undefined);
    const before = worldContext.pack.burgs[1]!.population!;
    simulateDemographics(1);
    expect(worldContext.pack.burgs[1]!.population).toBe(before);
  });

  it("does not reduce population when waterSecurity is at/above the safe threshold", () => {
    worldContext.pack = makeWorld(50);
    const before = worldContext.pack.burgs[1]!.population!;
    simulateDemographics(1);
    expect(worldContext.pack.burgs[1]!.population).toBeCloseTo(before, 5);

    worldContext.pack = makeWorld(80);
    const beforeHigh = worldContext.pack.burgs[1]!.population!;
    simulateDemographics(1);
    expect(worldContext.pack.burgs[1]!.population).toBeCloseTo(beforeHigh, 5);
  });

  it("reduces population as waterSecurity drops below the safe threshold, worse water costing more", () => {
    worldContext.pack = makeWorld(40);
    const beforeModerate = worldContext.pack.burgs[1]!.population!;
    simulateDemographics(1);
    const afterModerate = worldContext.pack.burgs[1]!.population!;
    expect(afterModerate).toBeLessThan(beforeModerate);
    const moderateLoss = beforeModerate - afterModerate;

    worldContext.pack = makeWorld(0);
    const beforeCollapsed = worldContext.pack.burgs[1]!.population!;
    simulateDemographics(1);
    const afterCollapsed = worldContext.pack.burgs[1]!.population!;
    const collapsedLoss = beforeCollapsed - afterCollapsed;

    expect(collapsedLoss).toBeGreaterThan(moderateLoss);
  });

  it("records the loss under the 'disease' cause, not 'famine'", () => {
    worldContext.pack = makeWorld(0);
    simulateDemographics(1);

    const totals = getDeathsByState("day").get(1);
    expect(totals?.disease).toBeGreaterThan(0);
    expect(totals?.famine).toBe(0);
  });

  it("applies regardless of food supply — a well-fed, growing town still loses residents", () => {
    useOptionsState.setState({ demographicBirthRate: 0.25, demographicChildMortalityRate: 0 });
    worldContext.pack = makeWorld(0); // plenty of capacity headroom (roomForGrowth > 0)
    const before = worldContext.pack.burgs[1]!.population!;
    simulateDemographics(1);
    // Births would otherwise grow the town — confirm epidemic mortality still bites through that.
    expect(worldContext.pack.burgs[1]!.population).toBeLessThan(before);
  });
});
