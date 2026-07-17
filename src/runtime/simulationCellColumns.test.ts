import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createPresentationData } from "./presentationData";
import { bindSimulationCellColumns } from "./simulationCellColumns";
import { createWorldDocument } from "./worldArchive";

function createWorld(): WorldContext {
  return {
    pack: {
      cells: {
        i: new Uint16Array([0, 1]),
        pop: new Float32Array([10, 20]),
        capacity: new Float32Array([30, 40]),
        children: new Float32Array([4, 8]),
        maleAdults: new Float32Array([3, 6]),
        femaleAdults: new Float32Array([2, 4]),
        elders: new Float32Array([1, 2]),
        danger: new Uint8Array([1, 2])
      }
    },
    grid: {},
    seed: "test",
    mapId: 1,
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
  return {
    currentYear: 0,
    currentMonth: 1,
    currentDay: 1,
    era: "",
    tickCount: 0,
    worldSeason: "spring",
    cells: {
      population: new Float32Array(),
      carryingCapacity: new Float32Array(),
      children: new Float32Array(),
      maleAdults: new Float32Array(),
      femaleAdults: new Float32Array(),
      elders: new Float32Array(),
      danger: new Uint8Array()
    },
    intelligence: {},
    strategicGoals: {}
  };
}

describe("SimulationData cell-column compatibility adapter", () => {
  it("moves legacy dynamic columns into SimulationContext while retaining source-compatible access", () => {
    const world = createWorld();
    const simulation = createSimulation();

    bindSimulationCellColumns(world, simulation);

    expect(simulation.cells.population).toEqual(new Float32Array([10, 20]));
    expect(simulation.cells.danger).toEqual(new Uint8Array([1, 2]));
    expect(Object.getOwnPropertyDescriptor(world.pack.cells, "pop")?.get).toBeTypeOf("function");

    const nextPopulation = new Float32Array([11, 21]);
    world.pack.cells.pop = nextPopulation;

    expect(simulation.cells.population).toBe(nextPopulation);
    expect(world.pack.cells.pop).toBe(nextPopulation);
    expect(() => {
      world.pack.cells.pop = new Float32Array([1]);
    }).toThrow("must match the current topology cell count");
  });

  it("archives one canonical simulation copy rather than pack-cell mirror copies", () => {
    const world = createWorld();
    const simulation = createSimulation();
    bindSimulationCellColumns(world, simulation);

    const document = createWorldDocument(world, simulation, createPresentationData(), []);

    expect(Object.hasOwn(document.world.pack.cells, "pop")).toBe(false);
    expect(Object.hasOwn(document.world.pack.cells, "danger")).toBe(false);
    expect(Array.from(document.simulation.cells.population)).toEqual([10, 20]);
    expect(Array.from(document.simulation.cells.danger)).toEqual([1, 2]);

    bindSimulationCellColumns(document.world, document.simulation);
    expect(document.world.pack.cells.pop).toBe(document.simulation.cells.population);
  });

  it("adopts pack-cell values from an archive written before SimulationData owned cells", () => {
    const world = createWorld();
    const simulation = createSimulation();
    delete (simulation as Partial<SimulationContext>).cells;

    bindSimulationCellColumns(world, simulation);

    expect(Array.from(simulation.cells.population)).toEqual([10, 20]);
    expect(world.pack.cells.pop).toBe(simulation.cells.population);
  });
});
