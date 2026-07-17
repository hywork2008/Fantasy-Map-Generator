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

    const document = createWorldDocument(world, simulation, createPresentationData(), []);

    expect(Object.hasOwn(document.world.pack, "characters")).toBe(false);
    expect(Object.hasOwn(document.world.pack, "goods")).toBe(false);
    expect(Object.hasOwn(document.world.pack.cells, "good")).toBe(false);
    expect(Object.hasOwn(document.world.pack.burgs[1], "production")).toBe(false);
    expect(Object.hasOwn(document.world.pack.states[1], "rulerId")).toBe(false);
    expect(document.simulation.extensions.characters?.characters).toEqual([{ i: 1, name: "Ari" }]);

    bindExtensionStateSlices(document.world, document.simulation);
    expect(document.world.pack.characters).toBe(document.simulation.extensions.characters?.characters);
    expect((document.world.pack.states[1] as unknown as Record<string, unknown>).rulerId).toBe(1);
  });

  it("does not carry extension state into a newly generated map", () => {
    const simulation = createSimulation();
    simulation.extensions.economy = { goods: [{ i: 2, name: "Grain" }] };

    resetExtensionStateSlices(simulation);

    expect(simulation.extensions).toEqual({});
  });
});
