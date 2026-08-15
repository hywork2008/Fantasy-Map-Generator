import { describe, expect, it } from "vitest";
import {
  createEmptyFrontierSimulationState,
  FRONTIER_STAGE,
  type SimulationContext
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createRNGService } from "../utils/probabilityUtils";
import {
  advanceFrontierExpansion,
  getFrontierCandidateBlockerSummaries,
  getFrontierCandidateSummaries,
  getFrontierProjectSlots,
  snapshotFrontierBudgets
} from "./frontierExpansion";

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
      states: [{ i: 0 }, { i: 1, treasury, removed: false }],
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
    rng: createRNGService(() => 0.5)
  });
}

describe("Frontier Expansion Phase 3", () => {
  it("establishes an outpost and settles it after sustained annual support without claiming land", () => {
    const world = createWorld();
    const simulation = createSimulation(100);

    const established = advance(world, simulation);
    expect(established.established).toEqual([1]);
    expect(established.topics).toEqual(
      expect.arrayContaining(["simulation.cells", "simulation.states", "map.settlements"])
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
      capacity: new Float32Array([100, 1, 50]),
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

  it("pools several small local surpluses into one viable frontier expedition", () => {
    const world = createWorld();
    world.pack.cells = {
      ...world.pack.cells,
      i: new Uint16Array([0, 1, 2]),
      c: [[2], [2], [0, 1]],
      state: new Uint16Array([1, 1, 0]),
      province: new Uint16Array([1, 1, 0]),
      pop: new Float32Array([20, 20, 0]),
      capacity: new Float32Array([20, 20, 50]),
      children: new Float32Array([5, 5, 0]),
      maleAdults: new Float32Array([5, 5, 0]),
      femaleAdults: new Float32Array([5, 5, 0]),
      elders: new Float32Array([5, 5, 0]),
      danger: new Uint8Array([0, 0, 10]),
      h: new Uint8Array([30, 30, 30]),
      s: new Uint8Array([50, 50, 50]),
      r: new Uint16Array([0, 0, 1]),
      harbor: new Uint8Array([0, 0, 0]),
      conf: new Uint8Array([0, 0, 0]),
      burg: new Uint16Array([0, 0, 0]),
      routes: { 0: {}, 1: {}, 2: {} }
    };
    const simulation = createSimulation(100, 100, 3);

    const candidates = getFrontierCandidateSummaries(world, simulation);
    expect(candidates).toEqual([expect.objectContaining({ cellId: 2, sourceCellIds: [0, 1], colonists: 7 })]);

    const result = advance(world, simulation);

    expect(result.established).toEqual([2]);
    expect(world.pack.cells.pop[0]).toBeCloseTo(16.5);
    expect(world.pack.cells.pop[1]).toBeCloseTo(16.5);
    expect(world.pack.cells.pop[2]).toBeCloseTo(7);
  });

  it("opens several independently supplied frontier sectors when State capacity permits", () => {
    const world = createWorld();
    world.pack.cells = {
      ...world.pack.cells,
      i: new Uint16Array([0, 1, 2, 3, 4, 5]),
      c: [[3], [4], [5], [0], [1], [2]],
      state: new Uint16Array([1, 1, 1, 0, 0, 0]),
      province: new Uint16Array([1, 1, 1, 0, 0, 0]),
      pop: new Float32Array([100, 100, 100, 0, 0, 0]),
      capacity: new Float32Array([100, 100, 100, 50, 50, 50]),
      children: new Float32Array([25, 25, 25, 0, 0, 0]),
      maleAdults: new Float32Array([25, 25, 25, 0, 0, 0]),
      femaleAdults: new Float32Array([25, 25, 25, 0, 0, 0]),
      elders: new Float32Array([25, 25, 25, 0, 0, 0]),
      danger: new Uint8Array([0, 0, 0, 10, 10, 10]),
      h: new Uint8Array([30, 30, 30, 30, 30, 30]),
      s: new Uint8Array([50, 50, 50, 50, 50, 50]),
      r: new Uint16Array([0, 0, 0, 1, 1, 1]),
      harbor: new Uint8Array([0, 0, 0, 0, 0, 0]),
      conf: new Uint8Array([0, 0, 0, 0, 0, 0]),
      burg: new Uint16Array([0, 0, 0, 0, 0, 0]),
      routes: { 0: {}, 1: {}, 2: {}, 3: {}, 4: {}, 5: {} }
    };
    const simulation = createSimulation(100, 100, 6);

    expect(getFrontierProjectSlots(1, world.pack.cells)).toBe(3);

    const result = advance(world, simulation);

    expect(result.established).toEqual([3, 4, 5]);
    expect(Object.values(simulation.frontier.projects)).toHaveLength(3);
  });

  it("measures colonist surplus against subsistence capacity, not terrain capacity", () => {
    const world = createWorld();
    // Terrain C=100 would keep 65 people at home, so 55 looks like no surplus.
    // Subsistence K=70 keeps only 45.5, so the same village can still send an expedition.
    world.pack.cells = {
      ...world.pack.cells,
      pop: new Float32Array([55, 0]),
      capacity: new Float32Array([100, 50]),
      subsistenceCapacity: new Float32Array([70, 40]),
      children: new Float32Array([13.75, 0]),
      maleAdults: new Float32Array([13.75, 0]),
      femaleAdults: new Float32Array([13.75, 0]),
      elders: new Float32Array([13.75, 0])
    };
    const simulation = createSimulation(100);

    expect(getFrontierCandidateSummaries(world, simulation)).toEqual([
      expect.objectContaining({ stateId: 1, cellId: 1, colonists: expect.any(Number) })
    ]);
    expect(getFrontierCandidateSummaries(world, simulation)[0]?.colonists).toBeGreaterThanOrEqual(0.5);
    expect(advance(world, simulation).established).toEqual([1]);
  });

  it("does not advertise a candidate when its connected population reserve cannot form an expedition", () => {
    const world = createWorld();
    world.pack.cells = {
      ...world.pack.cells,
      pop: new Float32Array([13.5, 0]),
      capacity: new Float32Array([20, 50]),
      children: new Float32Array([3.375, 0]),
      maleAdults: new Float32Array([3.375, 0]),
      femaleAdults: new Float32Array([3.375, 0]),
      elders: new Float32Array([3.375, 0])
    };
    const simulation = createSimulation(100);

    expect(getFrontierCandidateSummaries(world, simulation)).toEqual([]);
    expect(getFrontierCandidateBlockerSummaries(world, simulation)).toEqual([
      expect.objectContaining({ stateId: 1, reason: "Population reserve 0.25 / 0.50 points" })
    ]);
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

  it("founds an outpost purely from the state's frontier applicant pool when no live cell has surplus", () => {
    const world = createWorld();
    // pop === subsistence K * SOURCE_RETENTION_RATIO exactly: cell-based surplus is zero.
    world.pack.cells.pop[0] = 65;
    const simulation = createSimulation(100);
    simulation.frontier.applicantPoolByState[1] = { maleAdults: 3, femaleAdults: 3 };

    const result = advance(world, simulation);

    expect(result.established).toEqual([1]);
    // The source cell is untouched — every colonist came from the pool.
    expect(world.pack.cells.pop[0]).toBe(65);
    expect(world.pack.cells.pop[1]).toBeCloseTo(6);
    expect(world.pack.cells.maleAdults[1]).toBeCloseTo(3);
    expect(world.pack.cells.femaleAdults[1]).toBeCloseTo(3);
    expect(world.pack.cells.children[1]).toBe(0);
    expect(simulation.frontier.applicantPoolByState[1]).toEqual({ maleAdults: 0, femaleAdults: 0 });
  });

  it("drains the applicant pool before pulling any further colonists out of live cells", () => {
    const world = createWorld();
    const simulation = createSimulation(100);
    simulation.frontier.applicantPoolByState[1] = { maleAdults: 1, femaleAdults: 1 };

    const result = advance(world, simulation);

    expect(result.established).toEqual([1]);
    // targetLimit is capacity[1] * 0.25 = 12.5: the pool's 2 colonists plus the cell's
    // (otherwise 12-colonist) surplus would exceed it, so the cell only tops up the
    // remainder (10.5) instead of contributing its full surplus.
    expect(world.pack.cells.pop[1]).toBeCloseTo(12.5);
    expect(world.pack.cells.pop[0]).toBeCloseTo(89.5);
    expect(simulation.frontier.applicantPoolByState[1]).toEqual({ maleAdults: 0, femaleAdults: 0 });
  });

  it("founding uses the pre-economy snapshot even after same-tick treasury drain", () => {
    const world = createWorld();
    const simulation = createSimulation(100, 0);
    expect(snapshotFrontierBudgets(world, simulation)).toBe(true);
    expect(simulation.frontier.budgetByState[1]).toBe(100);

    world.pack.states[1]!.treasury = 0;
    const result = advance(world, simulation);

    expect(result.established).toEqual([1]);
    expect(simulation.frontier.cellStages[1]).toBe(FRONTIER_STAGE.outpost);
  });

  it("expands on the marches settlement pattern", () => {
    const world = createWorld();
    world.options.initialSettlementPattern = "marches";
    const simulation = createSimulation(100);

    expect(advance(world, simulation).established).toEqual([1]);
  });

  it("does not recapture the post-economy remainder as next year's reserve", () => {
    const world = createWorld();
    const simulation = createSimulation(100, 80);
    world.pack.states[1]!.treasury = 3;

    advance(world, simulation);

    expect(simulation.frontier.budgetByState[1]).toBe(80);
  });

  it("lists each state and target cell once when several source cells can fund it", () => {
    const world = createWorld();
    world.pack.cells = {
      ...world.pack.cells,
      i: new Uint16Array([0, 1, 2]),
      c: [[2], [2], [0, 1]],
      state: new Uint16Array([1, 1, 0]),
      province: new Uint16Array([1, 1, 0]),
      pop: new Float32Array([100, 100, 0]),
      capacity: new Float32Array([100, 100, 50]),
      children: new Float32Array([25, 25, 0]),
      maleAdults: new Float32Array([25, 25, 0]),
      femaleAdults: new Float32Array([25, 25, 0]),
      elders: new Float32Array([25, 25, 0]),
      danger: new Uint8Array([0, 0, 10]),
      h: new Uint8Array([30, 30, 30]),
      s: new Uint8Array([50, 50, 50]),
      r: new Uint16Array([0, 0, 1]),
      harbor: new Uint8Array([0, 0, 0]),
      conf: new Uint8Array([0, 0, 0]),
      burg: new Uint16Array([0, 0, 0]),
      routes: { 0: {}, 1: {}, 2: {} }
    };
    const simulation = createSimulation(100, 100, 3);

    expect(getFrontierCandidateSummaries(world, simulation)).toEqual([
      expect.objectContaining({ stateId: 1, cellId: 2, sourceCellId: 0 })
    ]);
  });
});
