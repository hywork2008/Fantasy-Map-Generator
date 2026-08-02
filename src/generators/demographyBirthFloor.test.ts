import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { PackedGraph } from "../types/PackedGraph";
import { clearBirthFloorProvider, registerBirthFloorProvider } from "./birthModifiers";
import { simulateDemographics } from "./demography-simulator";

function baseBurgDemographics() {
  return {
    capacity: 1000,
    effectiveCapacity: 1000,
    children: 20,
    maleAdults: 30,
    femaleAdults: 40,
    elders: 10
  };
}

function resetBurg(group = "town"): void {
  worldContext.pack.burgs[1].group = group;
  worldContext.pack.burgs[1].demographics = baseBurgDemographics();
  worldContext.pack.burgs[1].population = 100;
}

describe("simulateDemographics birth floor (PR-P2)", () => {
  beforeEach(() => {
    useOptionsState.setState({
      demographicBirthRate: 0.25,
      demographicChildMortalityRate: 0,
      simAgriculture: false
    });
    worldContext.populationRate = 1;
    worldContext.pack = {
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
          population: 100,
          group: "town",
          state: 1,
          demographics: baseBurgDemographics()
        }
      ],
      states: [undefined, { i: 1, name: "A" }]
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearBirthFloorProvider();
  });

  it("uses max(continuous, due) — floor raises children by the excess over continuous", () => {
    registerBirthFloorProvider(args => args.continuousBirths + 5);
    simulateDemographics(1);
    const childrenWithFloor = worldContext.pack.burgs[1].demographics!.children;

    resetBurg();
    clearBirthFloorProvider();
    simulateDemographics(1);
    const childrenContinuousOnly = worldContext.pack.burgs[1].demographics!.children;

    expect(childrenWithFloor - childrenContinuousOnly).toBeCloseTo(5, 5);
  });

  it("does not sum continuous and due when due is lower", () => {
    // Floor returns 0 → same as continuous only
    registerBirthFloorProvider(() => 0);
    simulateDemographics(1);
    const withZeroFloor = worldContext.pack.burgs[1].demographics!.children;

    resetBurg();
    clearBirthFloorProvider();
    simulateDemographics(1);
    const continuousOnly = worldContext.pack.burgs[1].demographics!.children;

    expect(withZeroFloor).toBeCloseTo(continuousOnly, 5);
  });

  it("does not call provider when overpopulated (room ≤ 0)", () => {
    worldContext.pack.burgs[1].demographics = {
      capacity: 50,
      effectiveCapacity: 50,
      children: 20,
      maleAdults: 30,
      femaleAdults: 40,
      elders: 10
    };
    let providerCalled = false;
    registerBirthFloorProvider(() => {
      providerCalled = true;
      return 50;
    });
    simulateDemographics(1);
    expect(providerCalled).toBe(false);
  });

  it("skips forts", () => {
    resetBurg("fort");
    let providerCalled = false;
    registerBirthFloorProvider(() => {
      providerCalled = true;
      return 10;
    });
    simulateDemographics(1);
    expect(providerCalled).toBe(false);
  });
});
