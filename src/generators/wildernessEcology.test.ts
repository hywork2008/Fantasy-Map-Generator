import { beforeEach, describe, expect, it } from "vitest";
import {
  createEmptyFrontierSimulationState,
  createEmptyWildernessEcologyState,
  type SimulationContext
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { rebuildDangerFromMonsters } from "./dangerField";
import { advanceWildernessEcology } from "./wildernessEcology";

function createWorld(): WorldContext {
  const cells = {
    i: Uint16Array.from({ length: 8 }, (_, index) => index),
    c: [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6]],
    h: new Uint8Array([25, 25, 25, 25, 25, 25, 25, 25]),
    state: new Uint16Array([1, 1, 0, 0, 0, 0, 0, 0]),
    danger: new Uint8Array(8),
    wildLand: new Uint8Array(8)
  };
  return {
    pack: {
      cells,
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Aster", treasury: 80, removed: false }
      ],
      monsters: [
        {
          i: 0,
          cell: 5,
          name: "Dire Beast 0",
          rarity: 2,
          power: 8,
          basePower: 8,
          type: "Dire Beast"
        }
      ],
      markers: [],
      notes: []
    },
    options: { initialSettlementPattern: "marches" }
  } as unknown as WorldContext;
}

function createSimulation(): SimulationContext {
  return {
    currentYear: 100,
    currentMonth: 1,
    currentDay: 1,
    frontier: createEmptyFrontierSimulationState(8),
    wilderness: createEmptyWildernessEcologyState()
  } as SimulationContext;
}

const rng = {
  rand: () => 0.1,
  P: () => false,
  each: () => () => false,
  gauss: () => 0,
  Pint: (n: number) => Math.floor(n),
  ra: <T>(array: T[]) => array[0],
  rw: () => "",
  biased: () => 0,
  getNumberInRange: () => 0,
  generateSeed: () => "0"
};

describe("advanceWildernessEcology", () => {
  beforeEach(() => {
    useOptionsState.setState({ culturesSet: "highFantasy", threatCalculation: "max" });
  });

  it("starts a hunt and reduces monster power without claiming land", () => {
    const world = createWorld();
    rebuildDangerFromMonsters(world.pack.cells, world.pack.monsters!, "max");
    const dangerBefore = world.pack.cells.danger[5];
    const simulation = createSimulation();
    const stateBefore = Array.from(world.pack.cells.state);

    const result = advanceWildernessEcology({ world, simulation, rng });

    expect(result.started.length).toBe(1);
    expect(world.pack.monsters![0].power).toBeLessThan(8);
    expect(Array.from(world.pack.cells.state)).toEqual(stateBefore);
    expect(world.pack.cells.danger[5]).toBeLessThanOrEqual(dangerBefore);
    expect(Object.keys(simulation.wilderness.cullProjects).length).toBe(1);
  });

  it("does not annex cells when a hunt clears a monster", () => {
    const world = createWorld();
    world.pack.monsters![0].power = 1;
    world.pack.monsters![0].basePower = 1;
    world.pack.monsters![0].rarity = 1;
    rebuildDangerFromMonsters(world.pack.cells, world.pack.monsters!, "max");
    const simulation = createSimulation();
    simulation.wilderness.cullProjects[5] = {
      cellId: 5,
      stateId: 1,
      monsterId: 0,
      establishedYear: 99,
      progressYears: 0,
      dangerReduced: 0
    };
    const stateBefore = Array.from(world.pack.cells.state);

    const result = advanceWildernessEcology({ world, simulation, rng });

    expect(result.cleared).toContain(5);
    expect(world.pack.monsters).toHaveLength(0);
    expect(Array.from(world.pack.cells.state)).toEqual(stateBefore);
    expect(world.pack.cells.state[5]).toBe(0);
  });

  it("rewilds unhunted monsters toward basePower", () => {
    const world = createWorld();
    world.pack.monsters![0].power = 3;
    world.pack.monsters![0].basePower = 8;
    // Keep the threat far beyond MAX_HUNT_HOPS from the only state cell.
    world.pack.monsters![0].cell = 7;
    world.pack.cells.state = new Uint16Array([1, 0, 0, 0, 0, 0, 0, 0]);
    world.pack.states![1].treasury = 0; // cannot fund a hunt even if path exists
    const simulation = createSimulation();

    advanceWildernessEcology({ world, simulation, rng });

    expect(world.pack.monsters![0].power).toBeGreaterThan(3);
    expect(world.pack.monsters![0].power).toBeLessThanOrEqual(8);
  });

  it("is a no-op outside January 1", () => {
    const world = createWorld();
    const simulation = createSimulation();
    simulation.currentMonth = 3;
    simulation.currentDay = 10;
    const power = world.pack.monsters![0].power;

    const result = advanceWildernessEcology({ world, simulation, rng });

    expect(result.topics).toEqual([]);
    expect(world.pack.monsters![0].power).toBe(power);
  });
});
