import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyFrontierSimulationState,
  FRONTIER_STAGE,
  type SimulationContext
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { Burgs } from "./burgs-generator";
import { incorporateEligibleFrontierSettlements } from "./frontierIncorporation";
import { Routes } from "./routes-generator";

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
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    vi.spyOn(Routes, "connectFrontier").mockReturnValue(undefined);
  });
  it("claims only the land-connected corridor and refreshes State, Province, and neighbor aggregates", () => {
    const world = createWorld(true);
    const simulation = createSimulation();
    const connectFrontier = vi.mocked(Routes.connectFrontier).mockReturnValue({ i: 8 } as never);

    const result = incorporateEligibleFrontierSettlements({ world, simulation });

    expect(connectFrontier).toHaveBeenCalledWith(2, 1);
    expect(result.incorporations).toEqual([
      expect.objectContaining({
        settlementCellId: 2,
        stateId: 1,
        cellIds: [2, 1],
        provinceId: 1,
        routeAdded: true
      })
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

  it("incorporates a supported settlement at the minimum viable frontier population", () => {
    const world = createWorld(true);
    world.pack.cells.pop[2] = 0.5;
    const simulation = createSimulation();

    expect(incorporateEligibleFrontierSettlements({ world, simulation }).incorporations).toHaveLength(1);
    expect(world.pack.cells.state[2]).toBe(1);
  });

  it("secures a surveyed resource only when its frontier settlement is incorporated", () => {
    const world = createWorld(true);
    const simulation = createSimulation();
    simulation.frontier.resourceClaimsByCell[2] = {
      cellId: 2,
      stateId: 1,
      commodity: "gold",
      discoveredYear: 100,
      status: "guarding",
      guardRegimentId: 4
    };

    incorporateEligibleFrontierSettlements({ world, simulation });

    expect(simulation.frontier.resourceClaimsByCell[2]?.status).toBe("secured");
  });

  it("leaves an otherwise eligible settlement unclaimed when no land corridor reaches its State", () => {
    const world = createWorld(false);
    const simulation = createSimulation();

    expect(incorporateEligibleFrontierSettlements({ world, simulation }).incorporations).toEqual([]);
    expect(world.pack.cells.state).toEqual(new Uint16Array([1, 0, 0, 2]));
    expect(simulation.frontier.projects[2]).toBeDefined();
  });

  it("incorporates a seaborne settlement as an overseas province and opens its harbour route", () => {
    const world = createWorld(false);
    world.pack.cells.p = [
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0]
    ];
    const simulation = createSimulation();
    simulation.frontier.projects[2]!.origin = "seaborne";
    const addBurg = vi.spyOn(Burgs, "add").mockReturnValue({ burgId: 7, newRoute: { i: 4 } } as never);

    const result = incorporateEligibleFrontierSettlements({ world, simulation });

    expect(result.incorporations).toEqual([
      expect.objectContaining({ settlementCellId: 2, origin: "seaborne", burgId: 7, routeAdded: true })
    ]);
    expect(world.pack.cells.state[2]).toBe(1);
    expect(simulation.frontier.seaborneBeachheadsByState[1]).toEqual([2]);
    expect(addBurg).toHaveBeenCalledWith([20, 0], { routeStateId: 1, developPort: true });
  });
});
