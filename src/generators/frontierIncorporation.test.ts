import { describe, expect, it } from "vitest";
import {
  createEmptyFrontierSimulationState,
  FRONTIER_STAGE,
  type SimulationContext
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { incorporateEligibleFrontierSettlements } from "./frontierIncorporation";

function createWorld(corridorConnected: boolean): WorldContext {
  return {
    pack: {
      cells: {
        i: new Uint16Array([0, 1, 2, 3]),
        c: corridorConnected ? [[1], [0, 2], [1, 3], [2]] : [[1], [0], [3], [2]],
        state: new Uint16Array([1, 0, 0, 2]),
        province: new Uint16Array([1, 0, 0, 2]),
        pop: new Float32Array([20, 0, 6, 20]),
        area: new Float32Array([1, 1, 1, 1]),
        burg: new Uint16Array([0, 0, 0, 0]),
        h: new Uint8Array([30, 30, 30, 30]),
        routes: { 0: {}, 1: {}, 2: {}, 3: {} }
      },
      states: [{ i: 0 }, { i: 1, name: "A", provinces: [1] }, { i: 2, name: "B", provinces: [2] }],
      provinces: [0, { i: 1, state: 1 }, { i: 2, state: 2 }],
      burgs: []
    }
  } as unknown as WorldContext;
}

function createSimulation(): SimulationContext {
  const frontier = createEmptyFrontierSimulationState(4);
  frontier.cellStages[2] = FRONTIER_STAGE.settlement;
  frontier.projects[2] = {
    cellId: 2,
    stateId: 1,
    stage: FRONTIER_STAGE.settlement,
    establishedYear: 100,
    supportYears: 3,
    failedSupportYears: 0
  };
  return { currentYear: 104, frontier } as SimulationContext;
}

describe("frontier incorporation transaction", () => {
  it("claims only the land-connected corridor and refreshes State, Province, and neighbor aggregates", () => {
    const world = createWorld(true);
    const simulation = createSimulation();

    const result = incorporateEligibleFrontierSettlements({ world, simulation });

    expect(result.incorporations).toEqual([
      expect.objectContaining({ settlementCellId: 2, stateId: 1, cellIds: [2, 1], provinceId: 1 })
    ]);
    expect(world.pack.cells.state).toEqual(new Uint16Array([1, 1, 1, 2]));
    expect(world.pack.cells.province).toEqual(new Uint16Array([1, 1, 1, 2]));
    expect(simulation.frontier.cellStages[1]).toBe(FRONTIER_STAGE.incorporated);
    expect(simulation.frontier.cellStages[2]).toBe(FRONTIER_STAGE.incorporated);
    expect(simulation.frontier.projects[2]).toBeUndefined();
    expect(world.pack.states[1]?.cells).toBe(3);
    expect(world.pack.states[1]?.neighbors).toEqual([2]);
    expect(world.pack.provinces[1]?.rural).toBe(26);
  });

  it("incorporates a supported settlement that is still below the old four-point village size", () => {
    const world = createWorld(true);
    world.pack.cells.pop[2] = 1.2;
    const simulation = createSimulation();

    expect(incorporateEligibleFrontierSettlements({ world, simulation }).incorporations).toHaveLength(1);
    expect(world.pack.cells.state[2]).toBe(1);
  });

  it("leaves an otherwise eligible settlement unclaimed when no land corridor reaches its State", () => {
    const world = createWorld(false);
    const simulation = createSimulation();

    expect(incorporateEligibleFrontierSettlements({ world, simulation }).incorporations).toEqual([]);
    expect(world.pack.cells.state).toEqual(new Uint16Array([1, 0, 0, 2]));
    expect(simulation.frontier.projects[2]).toBeDefined();
  });
});
