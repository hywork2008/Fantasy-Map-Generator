import { describe, expect, it } from "vitest";
import { createEmptyFrontierSimulationState, type SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { getSettlementPromotionCandidates } from "./demography-simulator";

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
