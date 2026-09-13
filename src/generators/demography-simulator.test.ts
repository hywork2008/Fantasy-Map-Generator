import { describe, expect, it } from "vitest";
import { createEmptyFrontierSimulationState, type SimulationContext } from "../context/simulationContext";
import { type WorldContext, worldContext } from "../context/worldContext";
import { getSettlementPromotionCandidates, simulateDemographics } from "./demography-simulator";

function createWorld(withNearbyBurg = false): WorldContext {
  return {
    pack: {
      cells: {
        i: new Uint16Array([0, 1, 2]),
        c: [[1], [0, 2], [1]],
        state: new Uint16Array([1, 1, 1]),
        burg: new Uint16Array([0, withNearbyBurg ? 1 : 0, 0]),
        pop: new Float32Array([16, 12, 5]),
        h: new Uint8Array([30, 30, 30]),
        r: new Uint16Array([1, 0, 0]),
        harbor: new Uint8Array([0, 0, 0]),
        conf: new Uint8Array([0, 0, 0]),
        routes: { 0: { 1: 0 }, 1: { 0: 0, 2: 0 }, 2: { 1: 0 } }
      },
      states: [{ i: 0 }, { i: 1, removed: false }],
      burgs: withNearbyBurg ? ([0, { i: 1, state: 1, cell: 1, population: 1 }] as never) : []
    }
  } as unknown as WorldContext;
}

function createSimulation(): SimulationContext {
  return {
    frontier: createEmptyFrontierSimulationState(3)
  } as SimulationContext;
}

describe("getSettlementPromotionCandidates", () => {
  it("promotes one well-sited service centre per state from population points", () => {
    const candidates = getSettlementPromotionCandidates(createWorld(), createSimulation());

    expect(candidates).toEqual([expect.objectContaining({ stateId: 1, cellId: 0, settlementPopulation: 4.8 })]);
  });

  it("keeps a two-cell service catchment around an existing burg", () => {
    expect(getSettlementPromotionCandidates(createWorld(true), createSimulation())).toEqual([]);
  });

  it("does not urbanise a populous but unconnected rural cell", () => {
    const world = createWorld();
    world.pack.cells.r = new Uint16Array([0, 0, 0]);
    world.pack.cells.routes = { 0: { 1: 0 }, 1: { 0: 0 }, 2: {} };

    expect(getSettlementPromotionCandidates(world, createSimulation())).toEqual([]);
  });
});

describe("simulateDemographics — undead realm", () => {
  it("freezes population for Lich state cells and burgs and decays zombieShare", () => {
    const races: any[] = [];
    races[16] = { i: 16, key: "lich", name: "Lich" };
    worldContext.pack = {
      races,
      cultures: [
        { i: 0, name: "Wildlands", race: 0 },
        { i: 1, name: "Morbane", race: 16 }
      ],
      states: [
        { i: 0, name: "Neutral" },
        { i: 1, name: "Morbane Realm", culture: 1, removed: false }
      ],
      cells: {
        i: new Uint16Array([0, 1]),
        c: [[1], [0]],
        state: new Uint16Array([1, 1]),
        pop: new Float32Array([10, 10]),
        children: new Float32Array([0, 0]),
        maleAdults: new Float32Array([5, 5]),
        femaleAdults: new Float32Array([5, 5]),
        elders: new Float32Array([0, 0]),
        h: new Uint8Array([30, 30]),
        s: new Float32Array([1, 1]),
        r: new Uint16Array([0, 0])
      },
      burgs: [
        null,
        {
          i: 1,
          state: 1,
          population: 10,
          zombieShare: 0.75,
          demographics: {
            children: 0,
            maleAdults: 5,
            femaleAdults: 5,
            elders: 0,
            capacity: 20
          }
        }
      ]
    };

    const initialCellPop = worldContext.pack.cells.pop[0];
    const initialBurgPop = worldContext.pack.burgs[1].population;

    // Simulate 5 years
    simulateDemographics(5);

    // Cell population remains unchanged (no deaths, no births)
    expect(worldContext.pack.cells.pop[0]).toBe(initialCellPop);

    // Burg population remains unchanged
    expect(worldContext.pack.burgs[1].population).toBe(initialBurgPop);

    // zombieShare decayed by 5 * 0.02 = 0.10: 0.75 -> 0.65
    expect(worldContext.pack.burgs[1].zombieShare).toBeCloseTo(0.65, 3);
  });
});
