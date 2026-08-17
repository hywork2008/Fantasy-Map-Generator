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

  it("pulls the next frontier outpost toward a discovered resource without claiming it early", () => {
    const world = createWorld();
    world.pack.cells = {
      ...world.pack.cells,
      i: new Uint16Array([0, 1, 2]),
      p: [
        [0, 0],
        [1, 0],
        [20, 0]
      ],
      c: [[1, 2], [0], [0]],
      state: new Uint16Array([1, 0, 0]),
      province: new Uint16Array([1, 0, 0]),
      pop: new Float32Array([100, 0, 0]),
      capacity: new Float32Array([100, 50, 50]),
      children: new Float32Array([25, 0, 0]),
      maleAdults: new Float32Array([25, 0, 0]),
      femaleAdults: new Float32Array([25, 0, 0]),
      elders: new Float32Array([25, 0, 0]),
      danger: new Uint8Array([0, 10, 10]),
      h: new Uint8Array([30, 30, 30]),
      s: new Uint8Array([50, 50, 50]),
      r: new Uint16Array([0, 0, 0]),
      harbor: new Uint8Array([0, 0, 0]),
      conf: new Uint8Array([0, 0, 0]),
      burg: new Uint16Array([0, 0, 0]),
      routes: { 0: {}, 1: {}, 2: {} }
    };
    const simulation = createSimulation(100, 100, 3);
    // A regiment (regimentMovement.ts's guard march) has already reached the
    // site — only then does the frontier system treat it as worth reaching for.
    simulation.frontier.resourceClaimsByCell[2] = {
      cellId: 2,
      stateId: 1,
      commodity: "gold",
      discoveredYear: 100,
      status: "guarding"
    };

    const result = advance(world, simulation);

    expect(result.established[0]).toBe(2);
    expect(world.pack.cells.state[2]).toBe(0);
    expect(simulation.frontier.resourceClaimsByCell[2]?.status).toBe("settling");
  });

  it("does not pull an expedition toward a claim until its guard regiment has arrived", () => {
    const world = createWorld();
    world.pack.cells = {
      ...world.pack.cells,
      i: new Uint16Array([0, 1, 2]),
      p: [
        [0, 0],
        [1, 0],
        [20, 0]
      ],
      c: [[1, 2], [0], [0]],
      state: new Uint16Array([1, 0, 0]),
      province: new Uint16Array([1, 0, 0]),
      pop: new Float32Array([100, 0, 0]),
      capacity: new Float32Array([100, 50, 50]),
      children: new Float32Array([25, 0, 0]),
      maleAdults: new Float32Array([25, 0, 0]),
      femaleAdults: new Float32Array([25, 0, 0]),
      elders: new Float32Array([25, 0, 0]),
      danger: new Uint8Array([0, 10, 10]),
      h: new Uint8Array([30, 30, 30]),
      s: new Uint8Array([50, 50, 50]),
      r: new Uint16Array([0, 0, 0]),
      harbor: new Uint8Array([0, 0, 0]),
      conf: new Uint8Array([0, 0, 0]),
      burg: new Uint16Array([0, 0, 0]),
      routes: { 0: {}, 1: {}, 2: {} }
    };
    const simulation = createSimulation(100, 100, 3);

    for (const status of ["discovered", "guardMarching", "settling"] as const) {
      simulation.frontier.resourceClaimsByCell[2] = {
        cellId: 2,
        stateId: 1,
        commodity: "gold",
        discoveredYear: 100,
        status
      };
      const candidates = getFrontierCandidateSummaries(world, simulation);
      const claimCandidate = candidates.find(candidate => candidate.cellId === 2);
      expect(claimCandidate?.resourceClaimCellId).toBeUndefined();
    }

    simulation.frontier.resourceClaimsByCell[2]!.status = "guarding";
    const guardedCandidates = getFrontierCandidateSummaries(world, simulation);
    expect(guardedCandidates.find(candidate => candidate.cellId === 2)?.resourceClaimCellId).toBe(2);
  });

  it("does not let a distant generic mineral claim outrank a much closer, otherwise-equal site", () => {
    const world = createWorld();
    // Chain: 0 (owned) branches to 1 (one hop away) and to a five-hop line 2-3-4-5-6,
    // with a discovered iron claim sitting on the far end (6). Every candidate cell
    // shares identical terrain, so only hop distance and the resource bonus can
    // separate them. Iron keeps the Euclidean taper; gold is tested separately.
    const cellIds = [0, 1, 2, 3, 4, 5, 6];
    world.pack.cells = {
      ...world.pack.cells,
      i: Uint16Array.from(cellIds),
      c: [[1, 2], [0], [0, 3], [2, 4], [3, 5], [4, 6], [5]],
      p: cellIds.map(cellId => [cellId * 100, 0] as [number, number]),
      state: Uint16Array.from(cellIds, cellId => (cellId === 0 ? 1 : 0)),
      province: Uint16Array.from(cellIds, cellId => (cellId === 0 ? 1 : 0)),
      pop: Float32Array.from(cellIds, cellId => (cellId === 0 ? 100 : 0)),
      capacity: Float32Array.from(cellIds, cellId => (cellId === 0 ? 100 : 50)),
      children: Float32Array.from(cellIds, cellId => (cellId === 0 ? 25 : 0)),
      maleAdults: Float32Array.from(cellIds, cellId => (cellId === 0 ? 25 : 0)),
      femaleAdults: Float32Array.from(cellIds, cellId => (cellId === 0 ? 25 : 0)),
      elders: Float32Array.from(cellIds, cellId => (cellId === 0 ? 25 : 0)),
      danger: new Uint8Array(cellIds.length),
      h: new Uint8Array(cellIds.length).fill(30),
      s: new Uint8Array(cellIds.length).fill(50),
      r: new Uint16Array(cellIds.length),
      harbor: new Uint8Array(cellIds.length),
      conf: new Uint8Array(cellIds.length),
      burg: new Uint16Array(cellIds.length),
      routes: Object.fromEntries(cellIds.map(cellId => [cellId, {}]))
    };
    const simulation = createSimulation(100, 100, cellIds.length);
    simulation.frontier.resourceClaimsByCell[6] = {
      cellId: 6,
      stateId: 1,
      commodity: "iron",
      discoveredYear: 100,
      status: "guarding"
    };

    const candidates = getFrontierCandidateSummaries(world, simulation);
    const near = candidates.find(candidate => candidate.cellId === 1);
    const far = candidates.find(candidate => candidate.cellId === 6);
    expect(near).toBeDefined();
    expect(far).toBeDefined();
    // A five-hop reach for a generic mineral must not out-score the one-hop,
    // equally fundable, equally fertile alternative right next door.
    expect(near!.score).toBeGreaterThan(far!.score);
    expect(advance(world, simulation).established[0]).toBe(1);
  });

  it("walks toward a guarded gold vein instead of settling an unrelated closer cell", () => {
    const world = createWorld();
    // Same fork as the iron case: cell 1 is a one-hop dead end, cells 2-6 are
    // the corridor to a guarded gold vein. Gold commits the State to that
    // corridor, but the hop penalty still prefers the next step (2) over a jump.
    const cellIds = [0, 1, 2, 3, 4, 5, 6];
    world.pack.cells = {
      ...world.pack.cells,
      i: Uint16Array.from(cellIds),
      c: [[1, 2], [0], [0, 3], [2, 4], [3, 5], [4, 6], [5]],
      p: cellIds.map(cellId => [cellId * 100, 0] as [number, number]),
      state: Uint16Array.from(cellIds, cellId => (cellId === 0 ? 1 : 0)),
      province: Uint16Array.from(cellIds, cellId => (cellId === 0 ? 1 : 0)),
      pop: Float32Array.from(cellIds, cellId => (cellId === 0 ? 100 : 0)),
      capacity: Float32Array.from(cellIds, cellId => (cellId === 0 ? 100 : 50)),
      children: Float32Array.from(cellIds, cellId => (cellId === 0 ? 25 : 0)),
      maleAdults: Float32Array.from(cellIds, cellId => (cellId === 0 ? 25 : 0)),
      femaleAdults: Float32Array.from(cellIds, cellId => (cellId === 0 ? 25 : 0)),
      elders: Float32Array.from(cellIds, cellId => (cellId === 0 ? 25 : 0)),
      danger: new Uint8Array(cellIds.length),
      h: new Uint8Array(cellIds.length).fill(30),
      s: new Uint8Array(cellIds.length).fill(50),
      r: new Uint16Array(cellIds.length),
      harbor: new Uint8Array(cellIds.length),
      conf: new Uint8Array(cellIds.length),
      burg: new Uint16Array(cellIds.length),
      routes: Object.fromEntries(cellIds.map(cellId => [cellId, {}]))
    };
    const simulation = createSimulation(100, 100, cellIds.length);
    simulation.frontier.resourceClaimsByCell[6] = {
      cellId: 6,
      stateId: 1,
      commodity: "gold",
      discoveredYear: 100,
      status: "guarding"
    };

    const candidates = getFrontierCandidateSummaries(world, simulation);
    const side = candidates.find(candidate => candidate.cellId === 1);
    const step = candidates.find(candidate => candidate.cellId === 2);
    const vein = candidates.find(candidate => candidate.cellId === 6);
    expect(step).toBeDefined();
    expect(vein).toBeDefined();
    expect(step!.score).toBeGreaterThan(side?.score ?? Number.NEGATIVE_INFINITY);
    expect(step!.score).toBeGreaterThan(vein!.score);
    expect(advance(world, simulation).established[0]).toBe(2);
  });

  it("settles a riverless gold vein instead of a neighbouring river cell", () => {
    const world = createWorld();
    world.pack.cells = {
      ...world.pack.cells,
      i: new Uint16Array([0, 1, 2]),
      c: [[1, 2], [0], [0]],
      p: [
        [0, 0],
        [0, 20],
        [20, 0]
      ],
      state: new Uint16Array([1, 0, 0]),
      province: new Uint16Array([1, 0, 0]),
      pop: new Float32Array([100, 0, 0]),
      capacity: new Float32Array([100, 50, 50]),
      subsistenceCapacity: new Float32Array([100, 50, 10]),
      children: new Float32Array([25, 0, 0]),
      maleAdults: new Float32Array([25, 0, 0]),
      femaleAdults: new Float32Array([25, 0, 0]),
      elders: new Float32Array([25, 0, 0]),
      danger: new Uint8Array([0, 10, 10]),
      h: new Uint8Array([30, 30, 62]),
      s: new Uint8Array([50, 50, 20]),
      r: new Uint16Array([0, 1, 0]),
      harbor: new Uint8Array([0, 0, 0]),
      conf: new Uint8Array([0, 0, 0]),
      burg: new Uint16Array([0, 0, 0]),
      routes: { 0: {}, 1: {}, 2: {} }
    };
    const simulation = createSimulation(100, 100, 3);
    simulation.frontier.resourceClaimsByCell[2] = {
      cellId: 2,
      stateId: 1,
      commodity: "gold",
      discoveredYear: 100,
      status: "guarding"
    };

    const candidates = getFrontierCandidateSummaries(world, simulation);
    const river = candidates.find(candidate => candidate.cellId === 1);
    const gold = candidates.find(candidate => candidate.cellId === 2);
    expect(gold).toBeDefined();
    expect(gold!.score).toBeGreaterThan(river?.score ?? Number.NEGATIVE_INFINITY);
    expect(advance(world, simulation).established[0]).toBe(2);
  });

  it("keeps approaching gold through riverless cells rather than diverting to a river", () => {
    const world = createWorld();
    // Cell 1 is a wet one-hop site off the gold path. Cells 2-3 are dry highland
    // leading to the vein. The State should take the dry step toward gold.
    world.pack.cells = {
      ...world.pack.cells,
      i: new Uint16Array([0, 1, 2, 3]),
      c: [[1, 2], [0], [0, 3], [2]],
      p: [
        [0, 0],
        [0, 20],
        [20, 0],
        [40, 0]
      ],
      state: new Uint16Array([1, 0, 0, 0]),
      province: new Uint16Array([1, 0, 0, 0]),
      pop: new Float32Array([100, 0, 0, 0]),
      capacity: new Float32Array([100, 50, 8, 8]),
      subsistenceCapacity: new Float32Array([100, 50, 1, 1]),
      children: new Float32Array([25, 0, 0, 0]),
      maleAdults: new Float32Array([25, 0, 0, 0]),
      femaleAdults: new Float32Array([25, 0, 0, 0]),
      elders: new Float32Array([25, 0, 0, 0]),
      danger: new Uint8Array([0, 10, 10, 10]),
      h: new Uint8Array([30, 30, 60, 62]),
      s: new Uint8Array([50, 50, 15, 15]),
      r: new Uint16Array([0, 1, 0, 0]),
      harbor: new Uint8Array([0, 0, 0, 0]),
      conf: new Uint8Array([0, 0, 0, 0]),
      burg: new Uint16Array([0, 0, 0, 0]),
      routes: { 0: {}, 1: {}, 2: {}, 3: {} }
    };
    const simulation = createSimulation(100, 100, 4);
    simulation.frontier.resourceClaimsByCell[3] = {
      cellId: 3,
      stateId: 1,
      commodity: "gold",
      discoveredYear: 100,
      status: "guarding"
    };

    const candidates = getFrontierCandidateSummaries(world, simulation);
    const river = candidates.find(candidate => candidate.cellId === 1);
    const step = candidates.find(candidate => candidate.cellId === 2);
    const vein = candidates.find(candidate => candidate.cellId === 3);
    expect(step).toBeDefined();
    expect(vein).toBeDefined();
    expect(step!.score).toBeGreaterThan(river?.score ?? Number.NEGATIVE_INFINITY);
    expect(step!.score).toBeGreaterThan(vein!.score);
    expect(advance(world, simulation).established[0]).toBe(2);
  });

  it("can found a mining outpost on a gold vein below the ordinary farm-capacity floor", () => {
    const world = createWorld();
    world.pack.cells = {
      ...world.pack.cells,
      i: new Uint16Array([0, 1]),
      c: [[1], [0]],
      p: [
        [0, 0],
        [20, 0]
      ],
      state: new Uint16Array([1, 0]),
      province: new Uint16Array([1, 0]),
      pop: new Float32Array([100, 0]),
      capacity: new Float32Array([100, 4]),
      subsistenceCapacity: new Float32Array([100, 1]),
      children: new Float32Array([25, 0]),
      maleAdults: new Float32Array([25, 0]),
      femaleAdults: new Float32Array([25, 0]),
      elders: new Float32Array([25, 0]),
      danger: new Uint8Array([0, 10]),
      h: new Uint8Array([30, 62]),
      s: new Uint8Array([50, 15]),
      r: new Uint16Array([0, 0]),
      harbor: new Uint8Array([0, 0]),
      conf: new Uint8Array([0, 0]),
      burg: new Uint16Array([0, 0]),
      routes: { 0: {}, 1: {} }
    };
    const simulation = createSimulation(100, 100, 2);
    simulation.frontier.resourceClaimsByCell[1] = {
      cellId: 1,
      stateId: 1,
      commodity: "gold",
      discoveredYear: 100,
      status: "guarding"
    };

    expect(getFrontierCandidateSummaries(world, simulation)).toEqual([
      expect.objectContaining({ cellId: 1, resourceClaimCellId: 1 })
    ]);
    expect(advance(world, simulation).established).toEqual([1]);
  });

  it("extends the same mining-floor exception and pull strength to silver, not just gold", () => {
    const buildWorldWithClaim = (commodity: "gold" | "silver") => {
      const world = createWorld();
      world.pack.cells = {
        ...world.pack.cells,
        i: new Uint16Array([0, 1]),
        c: [[1], [0]],
        p: [
          [0, 0],
          [20, 0]
        ],
        state: new Uint16Array([1, 0]),
        province: new Uint16Array([1, 0]),
        pop: new Float32Array([100, 0]),
        capacity: new Float32Array([100, 4]),
        subsistenceCapacity: new Float32Array([100, 1]),
        children: new Float32Array([25, 0]),
        maleAdults: new Float32Array([25, 0]),
        femaleAdults: new Float32Array([25, 0]),
        elders: new Float32Array([25, 0]),
        danger: new Uint8Array([0, 10]),
        h: new Uint8Array([30, 62]),
        s: new Uint8Array([50, 15]),
        r: new Uint16Array([0, 0]),
        harbor: new Uint8Array([0, 0]),
        conf: new Uint8Array([0, 0]),
        burg: new Uint16Array([0, 0]),
        routes: { 0: {}, 1: {} }
      };
      const simulation = createSimulation(100, 100, 2);
      simulation.frontier.resourceClaimsByCell[1] = {
        cellId: 1,
        stateId: 1,
        commodity,
        discoveredYear: 100,
        status: "guarding"
      };
      return { world, simulation };
    };

    const gold = buildWorldWithClaim("gold");
    const silver = buildWorldWithClaim("silver");
    const goldCandidates = getFrontierCandidateSummaries(gold.world, gold.simulation);
    const silverCandidates = getFrontierCandidateSummaries(silver.world, silver.simulation);

    // Silver below the ordinary farm-capacity floor is just as foundable as
    // gold, and scores identically — the mining pull is not gold-specific.
    expect(silverCandidates).toEqual([expect.objectContaining({ cellId: 1, resourceClaimCellId: 1 })]);
    expect(silverCandidates[0]?.score).toBeCloseTo(goldCandidates[0]?.score ?? Number.NaN);
    expect(advance(silver.world, silver.simulation).established).toEqual([1]);
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

  it("can found an outpost on the danger margin, not only claimable wilderness", () => {
    const world = createWorld();
    world.pack.cells.danger = new Uint8Array([0, 40]);
    world.pack.cells.wildLand = new Uint8Array([0, 2]);
    const simulation = createSimulation(100);

    expect(advance(world, simulation).established).toEqual([1]);
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

  it("scores a riverless neighbour and a rainy well site instead of only on-cell rivers", () => {
    const world = createWorld();
    world.grid = { cells: { prec: new Uint8Array([20, 2]) } };
    world.pack.cells = {
      ...world.pack.cells,
      i: new Uint16Array([0, 1, 2]),
      c: [[1], [0, 2], [1]],
      g: new Uint16Array([0, 0, 1]),
      state: new Uint16Array([1, 0, 0]),
      province: new Uint16Array([1, 0, 0]),
      pop: new Float32Array([80, 0, 0]),
      capacity: new Float32Array([80, 40, 40]),
      subsistenceCapacity: new Float32Array([80, 40, 40]),
      children: new Float32Array([20, 0, 0]),
      maleAdults: new Float32Array([20, 0, 0]),
      femaleAdults: new Float32Array([20, 0, 0]),
      elders: new Float32Array([20, 0, 0]),
      danger: new Uint8Array([0, 10, 10]),
      h: new Uint8Array([30, 30, 30]),
      s: new Uint8Array([50, 50, 50]),
      r: new Uint16Array([1, 0, 0]),
      harbor: new Uint8Array([0, 0, 0]),
      conf: new Uint8Array([0, 0, 0]),
      burg: new Uint16Array([0, 0, 0]),
      routes: { 0: {}, 1: {}, 2: {} }
    };
    const simulation = createSimulation(100, 100, 3);

    const candidates = getFrontierCandidateSummaries(world, simulation);
    expect(candidates.map(candidate => candidate.cellId)).toContain(1);
    expect(candidates.find(candidate => candidate.cellId === 1)!.score).toBeGreaterThan(
      candidates.find(candidate => candidate.cellId === 2)?.score ?? Number.NEGATIVE_INFINITY
    );
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

  it("dispatches a seaborne expedition to an unclaimed natural harbour after land expansion is closed", () => {
    const world = createWorld();
    world.options.frontierStartMode = "seaborne";
    const cellIds = Array.from({ length: 16 }, (_, cellId) => cellId);
    world.pack.cells = {
      ...world.pack.cells,
      i: Uint16Array.from(cellIds),
      c: cellIds.map(cellId => {
        if (cellId === 1) return [3, 4];
        if (cellId === 3) return [1];
        if (cellId === 4) return [1, 5];
        if (cellId > 4) return cellId === 15 ? [14] : [cellId - 1, cellId + 1];
        return [];
      }),
      p: cellIds.map(cellId => [cellId * 10, 0] as [number, number]),
      state: Uint16Array.from(cellIds, cellId => (cellId === 0 ? 1 : 0)),
      province: Uint16Array.from(cellIds, cellId => (cellId === 0 ? 1 : 0)),
      pop: Float32Array.from(cellIds, cellId => (cellId === 0 ? 100 : 0)),
      capacity: Float32Array.from(cellIds, cellId => (cellId === 0 ? 100 : cellId === 1 ? 50 : 0)),
      children: Float32Array.from(cellIds, cellId => (cellId === 0 ? 25 : 0)),
      maleAdults: Float32Array.from(cellIds, cellId => (cellId === 0 ? 25 : 0)),
      femaleAdults: Float32Array.from(cellIds, cellId => (cellId === 0 ? 25 : 0)),
      elders: Float32Array.from(cellIds, cellId => (cellId === 0 ? 25 : 0)),
      danger: Uint8Array.from(cellIds, cellId => (cellId === 1 ? 10 : 0)),
      h: Uint8Array.from(cellIds, cellId => (cellId === 2 || cellId === 3 ? 0 : 30)),
      s: Uint8Array.from(cellIds, cellId => (cellId === 2 || cellId === 3 ? 0 : 50)),
      r: new Uint16Array(cellIds.length),
      harbor: Uint8Array.from(cellIds, cellId => (cellId === 0 || cellId === 1 ? 1 : 0)),
      haven: Uint16Array.from(cellIds, cellId => (cellId === 0 ? 2 : cellId === 1 ? 3 : 0)),
      f: Uint16Array.from(cellIds, cellId => (cellId === 2 || cellId === 3 ? 1 : 2)),
      burg: Uint16Array.from(cellIds, cellId => (cellId === 0 ? 1 : 0)),
      conf: new Uint8Array(cellIds.length),
      routes: Object.fromEntries(cellIds.map(cellId => [cellId, {}]))
    };
    world.pack.features = [0, { i: 1, type: "ocean", cells: 2 }, { i: 2, type: "island", cells: 20 }];
    world.pack.burgs = [{ i: 0 }, { i: 1, state: 1, cell: 0, port: 1 }];
    const simulation = createSimulation(100, 100, cellIds.length);

    // The same beachhead is rejected while a foreign State is only two hops inland.
    world.pack.cells.state[5] = 2;
    expect(getFrontierCandidateSummaries(world, simulation)).toEqual([]);
    world.pack.cells.state[5] = 0;

    expect(getFrontierCandidateSummaries(world, simulation)).toEqual([
      expect.objectContaining({ cellId: 1, origin: "seaborne", sourcePortCellId: 0 })
    ]);

    expect(advance(world, simulation).established).toEqual([1]);
    expect(simulation.frontier.projects[1]).toEqual(
      expect.objectContaining({ origin: "seaborne", sourcePortCellId: 0 })
    );
    expect(getFrontierCandidateSummaries(world, simulation)).toEqual([]);
  });

  it("does not treat a one- or two-cell islet as an overseas colony destination", () => {
    const world = createWorld();
    world.options.frontierStartMode = "seaborne";
    world.pack.cells = {
      ...world.pack.cells,
      i: new Uint16Array([0, 1, 2, 3]),
      c: [[], [3], [1], [1]],
      p: [
        [0, 0],
        [100, 0],
        [0, 10],
        [100, 10]
      ],
      state: new Uint16Array([1, 0, 0, 0]),
      province: new Uint16Array([1, 0, 0, 0]),
      pop: new Float32Array([100, 0, 0, 0]),
      capacity: new Float32Array([100, 50, 0, 0]),
      danger: new Uint8Array([0, 10, 0, 0]),
      h: new Uint8Array([30, 30, 0, 0]),
      s: new Uint8Array([50, 50, 0, 0]),
      r: new Uint16Array([0, 0, 0, 0]),
      harbor: new Uint8Array([1, 1, 0, 0]),
      haven: new Uint16Array([2, 3, 0, 0]),
      f: new Uint16Array([2, 3, 1, 1]),
      burg: new Uint16Array([1, 0, 0, 0]),
      conf: new Uint8Array([0, 0, 0, 0]),
      routes: { 0: {}, 1: {}, 2: {}, 3: {} }
    };
    world.pack.features = [
      0,
      { i: 1, type: "ocean", cells: 2 },
      { i: 2, type: "island", cells: 20 },
      { i: 3, type: "island", cells: 2 }
    ];
    world.pack.burgs = [{ i: 0 }, { i: 1, state: 1, cell: 0, port: 1 }];
    const simulation = createSimulation(100, 100, 4);

    expect(getFrontierCandidateSummaries(world, simulation)).toEqual([]);
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

  it("uses a state-wide applicant pool for a frontier reachable only from another owned cell", () => {
    const world = createWorld();
    world.pack.cells = {
      ...world.pack.cells,
      i: new Uint16Array([0, 1, 2]),
      c: [[], [2], [1]],
      state: new Uint16Array([1, 1, 0]),
      province: new Uint16Array([1, 1, 0]),
      pop: new Float32Array([65, 65, 0]),
      capacity: new Float32Array([100, 100, 50]),
      children: new Float32Array([16.25, 16.25, 0]),
      maleAdults: new Float32Array([16.25, 16.25, 0]),
      femaleAdults: new Float32Array([16.25, 16.25, 0]),
      elders: new Float32Array([16.25, 16.25, 0]),
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
    simulation.frontier.applicantPoolByState[1] = { maleAdults: 1, femaleAdults: 1 };

    expect(advance(world, simulation).established).toEqual([2]);
    expect(world.pack.cells.pop[2]).toBeCloseTo(2);
  });

  it("ships capital-supported settlers to an incorporated overseas beachhead before its local population has surplus", () => {
    const world = createWorld();
    // The local beachhead has no surplus, but it still has a viable adjacent
    // frontier cell. A funded annual convoy supplies the next expedition.
    world.pack.cells.pop[0] = 65;
    const simulation = createSimulation(100);
    simulation.frontier.seaborneBeachheadsByState[1] = [0];

    const result = advance(world, simulation);

    expect(result.established).toEqual([1]);
    expect(world.pack.cells.pop[0]).toBe(65);
    expect(world.pack.cells.pop[1]).toBeCloseTo(3);
    expect(world.pack.states[1]?.treasury).toBe(88);
    expect(simulation.frontier.applicantPoolByState[1]).toEqual({ maleAdults: 0, femaleAdults: 0 });
  });

  it("draws the larger live-cell surplus before topping up from the applicant pool", () => {
    const world = createWorld();
    const simulation = createSimulation(100);
    simulation.frontier.applicantPoolByState[1] = { maleAdults: 1, femaleAdults: 1 };

    const result = advance(world, simulation);

    expect(result.established).toEqual([1]);
    // targetLimit is capacity[1] * 0.25 = 12.5. Funding is one state-wide reserve (the
    // applicant pool and every owned cell's surplus), spent largest-contributor-first —
    // cell 0's 12-colonist surplus outweighs the pool's 2, so it's drawn first (fully),
    // and the pool only tops up the remaining 0.5.
    expect(world.pack.cells.pop[1]).toBeCloseTo(12.5);
    expect(world.pack.cells.pop[0]).toBeCloseTo(88);
    expect(simulation.frontier.applicantPoolByState[1]).toEqual({ maleAdults: 0.75, femaleAdults: 0.75 });
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
