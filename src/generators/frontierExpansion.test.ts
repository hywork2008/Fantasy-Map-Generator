import { describe, expect, it } from "vitest";
import {
  createEmptyFrontierSimulationState,
  FRONTIER_STAGE,
  type SimulationContext
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createRNGService } from "../utils/probabilityUtils";
import { advanceFrontierExpansion } from "./frontierExpansion";

function createWorld(treasury = 100): WorldContext {
  return {
    options: { initialSettlementPattern: "frontier" },
    pack: {
      cells: {
        i: new Uint16Array([0, 1]),
        c: [[1], [0]],
        state: new Uint16Array([1, 0]),
        province: new Uint16Array([1, 0]),
        pop: new Float32Array([100, 0]),
        capacity: new Float32Array([100, 50]),
        children: new Float32Array([25, 0]),
        maleAdults: new Float32Array([25, 0]),
        femaleAdults: new Float32Array([25, 0]),
        elders: new Float32Array([25, 0]),
        danger: new Uint8Array([0, 10]),
        area: new Float32Array([1, 1]),
        h: new Uint8Array([30, 30]),
        s: new Uint8Array([50, 50]),
        r: new Uint16Array([0, 1]),
        harbor: new Uint8Array([0, 0]),
        conf: new Uint8Array([0, 0]),
        burg: new Uint16Array([0, 0]),
        routes: { 0: { 1: 0 }, 1: { 0: 0 } }
      },
      states: [{ i: 0 }, { i: 1, treasury, foodStress: 0, removed: false }],
      burgs: [],
      provinces: [0]
    }
  } as unknown as WorldContext;
}

function createSimulation(year: number, budget = 100, cellCount = 2): SimulationContext {
  return {
    currentYear: year,
    currentMonth: 1,
    currentDay: 1,
    frontier: {
      ...createEmptyFrontierSimulationState(cellCount),
      budgetByState: { 1: budget }
    }
  } as SimulationContext;
}

function advance(world: WorldContext, simulation: SimulationContext) {
  return advanceFrontierExpansion({
    world,
    simulation,
    rng: createRNGService(() => 0.5),
    connectRoute: () => true
  });
}

describe("Frontier Expansion Phase 3", () => {
  it("establishes a route-connected outpost and settles it after sustained annual support without claiming land", () => {
    const world = createWorld();
    const simulation = createSimulation(100);

    const established = advance(world, simulation);
    expect(established.established).toEqual([1]);
    expect(established.topics).toEqual(
      expect.arrayContaining(["simulation.cells", "simulation.states", "map.settlements", "map.networks"])
    );
    expect(simulation.frontier.cellStages[1]).toBe(FRONTIER_STAGE.outpost);
    expect(world.pack.cells.state[1]).toBe(0);
    expect(world.pack.cells.province[1]).toBe(0);

    expect(world.pack.cells.pop[0]).toBeLessThan(100);
    expect(world.pack.cells.pop[1]).toBeGreaterThanOrEqual(4);

    for (const year of [101, 102, 103]) {
      simulation.currentYear = year;
      simulation.currentMonth = 1;
      simulation.currentDay = 1;
      advance(world, simulation);
    }

    expect(simulation.frontier.cellStages[1]).toBe(FRONTIER_STAGE.settlement);
    expect(simulation.frontier.projects[1]?.supportYears).toBe(3);
    expect(world.pack.cells.state[1]).toBe(0);
    expect(world.pack.cells.province[1]).toBe(0);

    simulation.currentYear = 104;
    const incorporated = advance(world, simulation);

    expect(incorporated.incorporated).toEqual([1]);
    expect(incorporated.topics).toEqual(
      expect.arrayContaining(["simulation.cells", "simulation.states", "map.politics", "map.settlements"])
    );
    expect(simulation.frontier.cellStages[1]).toBe(FRONTIER_STAGE.incorporated);
    expect(simulation.frontier.projects[1]).toBeUndefined();
    expect(world.pack.cells.state[1]).toBe(1);
    expect(world.pack.cells.province[1]).toBeGreaterThan(0);
    expect(world.pack.states[1]?.cells).toBe(2);
  });

  it("pauses an unsupported outpost before abandoning it after three failed annual provisions", () => {
    const world = createWorld();
    const simulation = createSimulation(100);
    advance(world, simulation);

    simulation.currentYear = 101;
    simulation.frontier.budgetByState[1] = 0;
    world.pack.states[1]!.treasury = 0;
    const paused = advance(world, simulation);

    expect(paused.abandoned).toEqual([]);
    expect(simulation.frontier.projects[1]?.failedSupportYears).toBe(1);

    simulation.currentYear = 102;
    advance(world, simulation);
    simulation.currentYear = 103;
    const result = advance(world, simulation);

    expect(result.abandoned).toEqual([1]);
    expect(simulation.frontier.cellStages[1]).toBe(FRONTIER_STAGE.wilderness);
    expect(simulation.frontier.projects[1]).toBeUndefined();
    expect(world.pack.cells.pop[1]).toBe(0);
    expect(world.pack.cells.state[1]).toBe(0);
    expect(world.pack.cells.province[1]).toBe(0);
  });

  it("does not start a project during severe food stress", () => {
    const world = createWorld();
    world.pack.states[1]!.foodStress = 0.75;
    const simulation = createSimulation(100);

    const result = advance(world, simulation);

    expect(result.established).toEqual([]);
    expect(simulation.frontier.cellStages[1]).toBe(FRONTIER_STAGE.wilderness);
    expect(world.pack.cells.pop[0]).toBe(100);
  });

  it("uses local carrying capacity when the economy market snapshot reports no food stock", () => {
    const world = createWorld();
    world.pack.states[1]!.foodStock = 0;
    const simulation = createSimulation(100);

    const result = advance(world, simulation);

    expect(result.established).toEqual([1]);
  });

  it("extends through a short unclaimed corridor instead of requiring the target to touch the State border", () => {
    const world = createWorld();
    world.pack.cells = {
      ...world.pack.cells,
      i: new Uint16Array([0, 1, 2]),
      c: [[1], [0, 2], [1]],
      state: new Uint16Array([1, 0, 0]),
      province: new Uint16Array([1, 0, 0]),
      pop: new Float32Array([100, 0, 0]),
      capacity: new Float32Array([100, 2, 50]),
      children: new Float32Array([25, 0, 0]),
      maleAdults: new Float32Array([25, 0, 0]),
      femaleAdults: new Float32Array([25, 0, 0]),
      elders: new Float32Array([25, 0, 0]),
      danger: new Uint8Array([0, 10, 10]),
      h: new Uint8Array([30, 30, 30]),
      s: new Uint8Array([50, 50, 50]),
      r: new Uint16Array([0, 0, 1]),
      harbor: new Uint8Array([0, 0, 0]),
      conf: new Uint8Array([0, 0, 0]),
      burg: new Uint16Array([1, 0, 0]),
      routes: { 0: {} }
    };
    const simulation = createSimulation(100, 100, 3);

    const result = advance(world, simulation);

    expect(result.established).toEqual([2]);
    expect(simulation.frontier.cellStages[1]).toBe(FRONTIER_STAGE.wilderness);
    expect(simulation.frontier.cellStages[2]).toBe(FRONTIER_STAGE.outpost);
  });

  it("does not re-evaluate a project twice in the same calendar year", () => {
    const world = createWorld();
    const simulation = createSimulation(100);
    const first = advance(world, simulation);
    const second = advance(world, simulation);

    expect(first.established).toEqual([1]);
    expect(second.topics).toEqual([]);
    expect(simulation.frontier.projects[1]?.supportYears).toBe(0);
  });
});
