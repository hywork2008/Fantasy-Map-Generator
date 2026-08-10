import { beforeEach, describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { advanceDungeonEcology, resetDungeonEcologyGate } from "./dungeonEcology";

function createWorld(): WorldContext {
  const n = 30;
  const cells = {
    i: Uint16Array.from({ length: n }, (_, index) => index),
    c: Array.from({ length: n }, (_, cell) => {
      const neighbors: number[] = [];
      if (cell > 0) neighbors.push(cell - 1);
      if (cell < n - 1) neighbors.push(cell + 1);
      return neighbors;
    }),
    p: Array.from({ length: n }, (_, cell) => [cell * 10, 0] as [number, number]),
    h: new Uint8Array(n).fill(30),
    burg: new Uint16Array(n),
    state: new Uint16Array(n),
    danger: new Uint8Array(n).fill(50),
    wildLand: new Uint8Array(n)
  };
  cells.burg[1] = 1;
  return {
    pack: {
      cells,
      burgs: [{ i: 1, cell: 1, name: "A", removed: false }],
      monsters: [],
      markers: [],
      dungeons: [],
      states: [{ i: 0, name: "Neutrals" }]
    },
    notes: [],
    biomesData: null,
    options: {}
  } as unknown as WorldContext;
}

const alwaysSpawnRng = {
  rand: () => 0.5,
  P: () => true,
  each: () => () => false,
  gauss: () => 0,
  Pint: (n: number) => Math.floor(n),
  ra: <T>(array: T[]) => array[0],
  rw: () => "",
  biased: () => 0,
  getNumberInRange: () => 0,
  generateSeed: () => "0"
};

describe("advanceDungeonEcology", () => {
  beforeEach(() => {
    useOptionsState.setState({ culturesSet: "highFantasy", dangerEnabled: true, year: 100, threatCalculation: "max" });
    resetDungeonEcologyGate();
  });

  it("can spawn a dungeon on Jan 1 when the roll succeeds", () => {
    const world = createWorld();
    const simulation = {
      currentYear: 120,
      currentMonth: 1,
      currentDay: 1
    } as SimulationContext;

    const result = advanceDungeonEcology({ world, simulation, rng: alwaysSpawnRng });
    expect(result.spawned).toBe(1);
    expect(world.pack.dungeons?.length).toBe(1);
    expect(world.pack.dungeons![0]!.appearedYear).toBe(120);
  });

  it("does not spawn off Jan 1", () => {
    const world = createWorld();
    const simulation = {
      currentYear: 120,
      currentMonth: 6,
      currentDay: 1
    } as SimulationContext;
    const result = advanceDungeonEcology({ world, simulation, rng: alwaysSpawnRng });
    expect(result.spawned).toBe(0);
  });
});
