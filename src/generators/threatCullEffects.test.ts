import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyWildernessEcologyState, type SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createDefaultBiomesData } from "../data/biomeCatalog";
import { useOptionsState } from "../store/optionsState";
import {
  armyYearPowerChunk,
  decayPestSuppression,
  getCullTargetsNearBurg,
  PC_ARMY_YEAR_FRACTION,
  pcArmyYearChunk,
  resolvePlayerCullEffect,
  setupHuntCost,
  yearsToClear
} from "./threatCullEffects";

function createWorld(options?: {
  monsterPower?: number;
  rarity?: number;
  withMarker?: boolean;
  forestPest?: boolean;
}): WorldContext {
  const forest = createDefaultBiomesData().codesByKey?.temperateDeciduousForest ?? 6;
  const grassland = createDefaultBiomesData().codesByKey?.grassland ?? 4;
  const biome = options?.forestPest ? forest : grassland;
  const cells = {
    i: Uint16Array.from({ length: 8 }, (_, index) => index),
    c: [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6]],
    h: new Uint8Array([25, 25, 25, 25, 25, 25, 25, 25]),
    state: new Uint16Array([1, 1, 0, 0, 0, 0, 0, 0]),
    danger: new Uint8Array(8),
    wildLand: new Uint8Array(8),
    biomeCode: Uint8Array.from({ length: 8 }, () => biome)
  };
  const power = options?.monsterPower ?? 8;
  const rarity = options?.rarity ?? 2;
  const markers = options?.withMarker ? [{ i: 99, type: "monster", icon: "🐉", cell: 5, x: 0, y: 0 }] : [];
  const notes = options?.withMarker ? [{ id: "marker99", name: "Beast", legend: "" }] : [];
  return {
    pack: {
      cells,
      burgs: [
        { i: 0 },
        {
          i: 1,
          cell: 1,
          state: 1,
          name: "Borderburg",
          x: 0,
          y: 0,
          removed: false
        }
      ],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Aster", treasury: 80, removed: false }
      ],
      monsters: [
        {
          i: 0,
          cell: 5,
          name: "Dire Beast 0",
          rarity,
          power,
          basePower: power,
          type: "Dire Beast"
        }
      ],
      markers,
      dungeons: []
    },
    notes,
    biomesData: createDefaultBiomesData(),
    options: { initialSettlementPattern: "marches" }
  } as unknown as WorldContext;
}

function createSimulation(): SimulationContext {
  return {
    currentYear: 100,
    currentMonth: 6,
    currentDay: 15,
    wilderness: createEmptyWildernessEcologyState()
  } as SimulationContext;
}

describe("threatCullEffects cost helpers", () => {
  it("matches macro yearsToClear / setupHuntCost tables", () => {
    expect(yearsToClear(1)).toBe(1);
    expect(yearsToClear(2)).toBe(2);
    expect(yearsToClear(3)).toBe(3);
    expect(yearsToClear(4)).toBe(5);
    expect(yearsToClear(5)).toBe(8);
    expect(setupHuntCost(1)).toBe(5);
    expect(setupHuntCost(3)).toBe(14);
    expect(setupHuntCost(5)).toBe(40);
  });

  it("uses PC_ARMY_YEAR_FRACTION = 0.25 for power chunks", () => {
    expect(PC_ARMY_YEAR_FRACTION).toBe(0.25);
    const monster = { power: 8, basePower: 8, rarity: 2 };
    // army chunk = ceil(8/2)=4; pc = ceil(4*0.25)=1
    expect(armyYearPowerChunk(monster)).toBe(4);
    expect(pcArmyYearChunk(monster)).toBe(1);
  });
});

describe("resolvePlayerCullEffect", () => {
  beforeEach(() => {
    useOptionsState.setState({ culturesSet: "highFantasy", threatCalculation: "max" });
  });

  it("reduces monster power and returns simulation.cells + map.annotations topics", () => {
    const world = createWorld({ monsterPower: 8, rarity: 2, withMarker: true });
    const simulation = createSimulation();
    const stateBefore = Array.from(world.pack.cells.state);

    const result = resolvePlayerCullEffect({
      world,
      simulation,
      target: {
        kind: "monster",
        monsterId: 0,
        cellId: 5,
        rarity: 2,
        powerSnapshot: 8,
        label: "Dire Beast 0"
      },
      intensity: 1
    });

    expect(result.powerReduced).toBeGreaterThan(0);
    expect(world.pack.monsters![0].power).toBeLessThan(8);
    expect(result.topics).toEqual(expect.arrayContaining(["simulation.cells", "map.annotations"]));
    expect(Array.from(world.pack.cells.state)).toEqual(stateBefore);
  });

  it("full-clear removes monster and marker and includes map.annotations", () => {
    const world = createWorld({ monsterPower: 1, rarity: 3, withMarker: true });
    const simulation = createSimulation();
    const stateBefore = Array.from(world.pack.cells.state);

    const result = resolvePlayerCullEffect({
      world,
      simulation,
      target: {
        kind: "monster",
        monsterId: 0,
        cellId: 5,
        rarity: 3,
        powerSnapshot: 1,
        label: "Greater"
      },
      intensity: 1
    });

    expect(result.cleared).toBe(true);
    expect(world.pack.monsters).toHaveLength(0);
    expect(world.pack.markers?.some(m => m.type === "monster")).toBe(false);
    expect(world.notes?.some(n => n.id === "marker99")).toBe(false);
    expect(result.topics).toContain("map.annotations");
    expect(result.topics).toContain("simulation.cells");
    expect(Array.from(world.pack.cells.state)).toEqual(stateBefore);
    expect(world.pack.cells.state[5]).toBe(0);
  });

  it("pest-only path is cells-only and writes pestSuppressionByCell", () => {
    const world = createWorld({ forestPest: true });
    world.pack.monsters = [];
    const simulation = createSimulation();

    const result = resolvePlayerCullEffect({
      world,
      simulation,
      target: {
        kind: "pest",
        monsterId: null,
        cellId: 3,
        rarity: 1,
        powerSnapshot: 10,
        label: "Boar drive"
      },
      intensity: 1
    });

    expect(result.topics).toContain("simulation.cells");
    expect(result.topics).not.toContain("map.annotations");
    expect(simulation.wilderness.pestSuppressionByCell?.[3]).toBeGreaterThan(0);
    expect(simulation.wilderness.pestSuppressionByCell?.[3]).toBeLessThanOrEqual(1);
  });

  it("join-macro updates dangerReduced diagnostics only", () => {
    const world = createWorld({ monsterPower: 8, rarity: 2 });
    const simulation = createSimulation();
    simulation.wilderness.cullProjects[5] = {
      cellId: 5,
      stateId: 1,
      monsterId: 0,
      establishedYear: 99,
      progressYears: 1,
      dangerReduced: 0
    };

    resolvePlayerCullEffect({
      world,
      simulation,
      target: {
        kind: "monster",
        monsterId: 0,
        cellId: 5,
        rarity: 2,
        powerSnapshot: 8,
        label: "Beast"
      },
      intensity: 1,
      macroCellId: 5
    });

    expect(simulation.wilderness.cullProjects[5].progressYears).toBe(1);
    expect(simulation.wilderness.cullProjects[5].dangerReduced).toBeGreaterThan(0);
  });

  it("intensity 0 is a no-op with empty topics", () => {
    const world = createWorld();
    const simulation = createSimulation();
    const power = world.pack.monsters![0].power;
    const result = resolvePlayerCullEffect({
      world,
      simulation,
      target: {
        kind: "monster",
        monsterId: 0,
        cellId: 5,
        rarity: 2,
        powerSnapshot: 8,
        label: "Beast"
      },
      intensity: 0
    });
    expect(result.topics).toEqual([]);
    expect(world.pack.monsters![0].power).toBe(power);
  });
});

describe("decayPestSuppression", () => {
  it("decays and drops zero keys", () => {
    const wilderness = createEmptyWildernessEcologyState();
    wilderness.pestSuppressionByCell = { 1: 0.2, 2: 0.1 };
    decayPestSuppression(wilderness);
    // 0.2 - 0.15 = 0.05; 0.1 - 0.15 <= 0 drop
    expect(wilderness.pestSuppressionByCell?.[1]).toBeCloseTo(0.05, 5);
    expect(wilderness.pestSuppressionByCell?.[2]).toBeUndefined();
  });
});

describe("getCullTargetsNearBurg", () => {
  beforeEach(() => {
    useOptionsState.setState({ culturesSet: "highFantasy" });
  });

  it("lists nearby monsters for a border burg", () => {
    const world = createWorld();
    const simulation = createSimulation();
    const targets = getCullTargetsNearBurg(world, simulation, 1);
    expect(targets.some(t => t.kind === "monster" && t.monsterId === 0)).toBe(true);
  });

  it("lists pest targets from hinterland base danger without painted danger", () => {
    const world = createWorld({ forestPest: true });
    world.pack.monsters = [];
    world.pack.cells.danger.fill(0);
    const simulation = createSimulation();
    const targets = getCullTargetsNearBurg(world, simulation, 1);
    expect(targets.some(t => t.kind === "pest")).toBe(true);
  });
});
