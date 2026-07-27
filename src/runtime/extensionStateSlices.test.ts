import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { Burg, State } from "../types/models";
import { bindExtensionStateSlices, resetExtensionStateSlices } from "./extensionStateSlices";
import { createPresentationData } from "./presentationData";
import { createWorldDocument } from "./worldArchive";

function createWorld(): WorldContext {
  return {
    pack: {
      cells: { i: new Uint16Array([0, 1]), good: new Uint16Array([2, 3]), market: new Uint16Array([4, 5]) },
      burgs: [0 as unknown as Burg, { i: 1, cell: 0, x: 0, y: 0, production: [{ good: "grain" }] } as unknown as Burg],
      characters: [{ i: 1, name: "Ari" }],
      goods: [{ i: 2, name: "Grain" }],
      markets: [{ i: 4, name: "North Market" }],
      mineralGeologicalProvinces: [{ i: 1, kind: "granite", cells: [0] }],
      mineralDistricts: [{ i: 1, type: "graniteTin", provinceId: 1, cell: 0, depositIds: [1], richness: 3 }],
      mineralDeposits: [
        {
          i: 1,
          districtId: 1,
          cell: 0,
          type: "graniteTin",
          primaryCommodity: "tin",
          commodities: ["tin", "copper"],
          richness: 3,
          depth: "shallow",
          discovered: false
        }
      ],
      mineOperations: [
        {
          i: 1,
          depositId: 1,
          burgId: 1,
          marketId: 4,
          workers: 12,
          technology: 1,
          drainage: 0.75,
          fuelAccess: 0.65,
          annualOutputTons: { tin: 12 },
          active: true
        }
      ],
      mintLedgers: [
        {
          stateId: 1,
          mintMarketId: 4,
          currencyDemand: 10,
          circulation: 60,
          lastMintedValue: 0,
          totalMintedValue: 12,
          lastSeigniorage: 0
        }
      ],
      states: [
        { i: 0, name: "Neutrals" } as State,
        {
          i: 1,
          name: "Aster",
          rulerId: 1,
          conflictAuthorizations: { 2: { origin: "player", startedAt: { year: 1, month: 1, day: 1 } } }
        } as unknown as State
      ]
    },
    grid: {},
    seed: "extension-slices",
    mapId: 2,
    mapHistory: [],
    notes: [],
    options: {},
    biomesData: {},
    nameBases: [],
    graphWidth: 100,
    graphHeight: 100,
    mapCoordinates: {},
    urbanization: 1,
    urbanDensity: 10,
    populationRate: 1,
    distanceScale: 1
  } as unknown as WorldContext;
}

function createSimulation(): SimulationContext {
  return { extensions: {} } as SimulationContext;
}

describe("extension state slice compatibility adapter", () => {
  it("adopts module-augmented pack fields into their extension namespace", () => {
    const world = createWorld();
    const simulation = createSimulation();

    bindExtensionStateSlices(world, simulation);

    expect(simulation.extensions.characters?.characters).toEqual([{ i: 1, name: "Ari" }]);
    expect(simulation.extensions.economy?.goods).toEqual([{ i: 2, name: "Grain" }]);
    expect(simulation.extensions.economy?.good).toEqual(new Uint16Array([2, 3]));
    expect(simulation.extensions.economy?.productionByBurg).toEqual({ 1: [{ good: "grain" }] });
    expect(simulation.extensions.economy?.mineralDistricts).toEqual([
      { i: 1, type: "graniteTin", provinceId: 1, cell: 0, depositIds: [1], richness: 3 }
    ]);
    expect(simulation.extensions.economy?.mineOperations).toHaveLength(1);
    expect(simulation.extensions.economy?.mintLedgers).toHaveLength(1);
    expect(simulation.extensions.nobility?.rulerIdByState).toEqual({ 1: 1 });

    const characters = [{ i: 2, name: "Bea" }];
    world.pack.characters = characters;
    expect(simulation.extensions.characters?.characters).toBe(characters);

    (world.pack.states[1] as unknown as Record<string, unknown>).rulerId = 2;
    const nobility = simulation.extensions.nobility as Record<string, unknown>;
    expect((nobility.rulerIdByState as Record<number, unknown>)[1]).toBe(2);
  });

  it("stores extension state once in an archive and restores its legacy projection", () => {
    const world = createWorld();
    const simulation = createSimulation();
    bindExtensionStateSlices(world, simulation);
    simulation.extensions.shipbuilding = {
      runtimeState: {
        queues: { 1: { shipClassId: "sloop", owner: "market", progress: 4, pendingWorkPoints: 2 } },
        surplusQueues: {},
        stateTechPoints: { 1: 3 },
        completedHulls: {},
        hulls: {},
        nextHullId: 1
      }
    };

    const document = createWorldDocument(world, simulation, createPresentationData(), []);

    expect(Object.hasOwn(document.world.pack, "characters")).toBe(false);
    expect(Object.hasOwn(document.world.pack, "goods")).toBe(false);
    expect(Object.hasOwn(document.world.pack, "mineralDeposits")).toBe(false);
    expect(Object.hasOwn(document.world.pack, "mineOperations")).toBe(false);
    expect(Object.hasOwn(document.world.pack, "mintLedgers")).toBe(false);
    expect(Object.hasOwn(document.world.pack.cells, "good")).toBe(false);
    expect(Object.hasOwn(document.world.pack.burgs[1], "production")).toBe(false);
    expect(Object.hasOwn(document.world.pack.states[1], "rulerId")).toBe(false);
    expect(document.simulation.extensions.characters?.characters).toEqual([{ i: 1, name: "Ari" }]);
    expect(document.simulation.extensions.shipbuilding?.runtimeState).toMatchObject({
      stateTechPoints: { 1: 3 }
    });

    bindExtensionStateSlices(document.world, document.simulation);
    expect(document.world.pack.characters).toBe(document.simulation.extensions.characters?.characters);
    expect((document.world.pack as unknown as Record<string, unknown>).mineralDeposits).toBe(
      document.simulation.extensions.economy?.mineralDeposits
    );
    expect((document.world.pack as unknown as Record<string, unknown>).mineOperations).toBe(
      document.simulation.extensions.economy?.mineOperations
    );
    expect((document.world.pack as unknown as Record<string, unknown>).mintLedgers).toBe(
      document.simulation.extensions.economy?.mintLedgers
    );
    expect((document.world.pack.states[1] as unknown as Record<string, unknown>).rulerId).toBe(1);
  });

  it("does not carry extension state into a newly generated map", () => {
    const simulation = createSimulation();
    simulation.extensions.economy = { goods: [{ i: 2, name: "Grain" }] };

    resetExtensionStateSlices(simulation);

    expect(simulation.extensions).toEqual({});
  });
});
