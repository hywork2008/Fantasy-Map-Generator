import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { PackedGraph } from "../types/PackedGraph";
import { simulateDemographics } from "./demography-simulator";
import { getDeathsByState, resetPopulationLossTracker } from "./populationLossTracker";

/**
 * Ledger-driven famine mortality/fertility from burg.foodSecurity — independent of
 * roomForGrowth / carrying-capacity starvation. Design: docs/plan/economy-coupling-audit.md L3.
 */
function baseBurgDemographics() {
  return {
    // Generous capacity so roomForGrowth stays >= 0 — isolates ledger famine from overcap starvation.
    capacity: 100_000,
    effectiveCapacity: 100_000,
    children: 200,
    maleAdults: 300,
    femaleAdults: 400,
    elders: 100
  };
}

function makeWorld(foodSecurity: number | undefined): PackedGraph {
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
        foodSecurity,
        demographics: baseBurgDemographics()
      }
    ],
    states: [undefined, { i: 1, name: "A" }]
  } as unknown as PackedGraph;
}

describe("simulateDemographics food-security famine", () => {
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

  it("does not reduce population when foodSecurity is unset (Economy off)", () => {
    worldContext.pack = makeWorld(undefined);
    const before = worldContext.pack.burgs[1]!.population!;
    simulateDemographics(1);
    expect(worldContext.pack.burgs[1]!.population).toBe(before);
  });

  it("does not reduce population when foodSecurity is fully secure", () => {
    worldContext.pack = makeWorld(1);
    const beforeFed = worldContext.pack.burgs[1]!.population!;
    simulateDemographics(1);
    expect(worldContext.pack.burgs[1]!.population).toBeCloseTo(beforeFed, 5);
  });

  it("does not record famine deaths when foodSecurity is at the famine-death band", () => {
    worldContext.pack = makeWorld(0.85);
    simulateDemographics(1);
    expect(getDeathsByState("day").get(1)?.famine ?? 0).toBe(0);
  });

  it("reduces population as foodSecurity drops below the famine-death band, worse famine costing more", () => {
    worldContext.pack = makeWorld(0.6);
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

  it("records the loss under the 'famine' cause, not 'disease'", () => {
    worldContext.pack = makeWorld(0);
    simulateDemographics(1);

    const totals = getDeathsByState("day").get(1);
    expect(totals?.famine).toBeGreaterThan(0);
    expect(totals?.disease).toBe(0);
  });

  it("applies regardless of housing headroom — a well-housed, growing town still loses residents", () => {
    useOptionsState.setState({ demographicBirthRate: 0.25, demographicChildMortalityRate: 0 });
    worldContext.pack = makeWorld(0);
    const before = worldContext.pack.burgs[1]!.population!;
    simulateDemographics(1);
    expect(worldContext.pack.burgs[1]!.population).toBeLessThan(before);
  });

  it("cuts births before deaths: foodSecurity in the birth-only band grows slower without famine deaths", () => {
    useOptionsState.setState({ demographicBirthRate: 0.25, demographicChildMortalityRate: 0 });

    worldContext.pack = makeWorld(1);
    simulateDemographics(1);
    const childrenFed = worldContext.pack.burgs[1]!.demographics!.children;

    worldContext.pack = makeWorld(0.9);
    simulateDemographics(1);
    const childrenStressed = worldContext.pack.burgs[1]!.demographics!.children;

    expect(childrenStressed).toBeLessThan(childrenFed);
    expect(getDeathsByState("day").get(1)?.famine ?? 0).toBe(0);
  });

  it("shrinks a megacity cut off from food over several years, while a fed city of the same size grows", () => {
    useOptionsState.setState({ demographicBirthRate: 0.25, demographicChildMortalityRate: 0 });

    worldContext.pack = makeWorld(1);
    const fedStart = worldContext.pack.burgs[1]!.population!;
    for (let year = 0; year < 5; year++) simulateDemographics(1);
    const fedAfter = worldContext.pack.burgs[1]!.population!;

    worldContext.pack = makeWorld(0);
    resetPopulationLossTracker();
    const cutOffStart = worldContext.pack.burgs[1]!.population!;
    for (let year = 0; year < 5; year++) simulateDemographics(1);
    const cutOffAfter = worldContext.pack.burgs[1]!.population!;

    expect(fedAfter).toBeGreaterThan(fedStart);
    expect(cutOffAfter).toBeLessThan(cutOffStart);
    expect(cutOffAfter).toBeLessThan(cutOffStart * 0.75);
  });
});
