import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { bindExtensionStateSlices, resetExtensionStateSlices } from "./extensionStateSlices";
import { createPresentationData } from "./presentationData";
import { createWorldDocument } from "./worldArchive";

function createWorld(): WorldContext {
  return {
    pack: {
      cells: { i: new Uint16Array([0, 1]), good: new Uint16Array([2, 3]), market: new Uint16Array([4, 5]) },
      characters: [{ i: 1, name: "Ari" }],
      goods: [{ i: 2, name: "Grain" }],
      markets: [{ i: 4, name: "North Market" }]
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

    const characters = [{ i: 2, name: "Bea" }];
    world.pack.characters = characters;
    expect(simulation.extensions.characters?.characters).toBe(characters);
  });

  it("stores extension state once in an archive and restores its legacy projection", () => {
    const world = createWorld();
    const simulation = createSimulation();
    bindExtensionStateSlices(world, simulation);

    const document = createWorldDocument(world, simulation, createPresentationData(), []);

    expect(Object.hasOwn(document.world.pack, "characters")).toBe(false);
    expect(Object.hasOwn(document.world.pack, "goods")).toBe(false);
    expect(Object.hasOwn(document.world.pack.cells, "good")).toBe(false);
    expect(document.simulation.extensions.characters?.characters).toEqual([{ i: 1, name: "Ari" }]);

    bindExtensionStateSlices(document.world, document.simulation);
    expect(document.world.pack.characters).toBe(document.simulation.extensions.characters?.characters);
  });

  it("does not carry extension state into a newly generated map", () => {
    const simulation = createSimulation();
    simulation.extensions.economy = { goods: [{ i: 2, name: "Grain" }] };

    resetExtensionStateSlices(simulation);

    expect(simulation.extensions).toEqual({});
  });
});
