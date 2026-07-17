import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { Burg } from "../types/models";
import { createPresentationData } from "./presentationData";
import { bindSimulationBurg, bindSimulationBurgState } from "./simulationBurgState";
import { createWorldDocument } from "./worldArchive";

function createWorld(): WorldContext {
  return {
    pack: {
      burgs: [
        0,
        {
          i: 1,
          cell: 4,
          x: 10,
          y: 20,
          population: 80,
          product: 6,
          treasury: 12,
          demographics: { capacity: 100, children: 20, maleAdults: 25, femaleAdults: 25, elders: 10 }
        }
      ]
    },
    grid: {},
    seed: "burg-simulation",
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
  return { burgs: {} } as SimulationContext;
}

describe("simulation burg compatibility adapter", () => {
  it("moves live burg values into a stable-id simulation table while retaining legacy access", () => {
    const world = createWorld();
    const simulation = createSimulation();

    bindSimulationBurgState(world, simulation);

    expect(simulation.burgs[1]).toMatchObject({ population: 80, product: 6, treasury: 12 });
    expect(Object.getOwnPropertyDescriptor(world.pack.burgs[1], "population")?.get).toBeTypeOf("function");

    world.pack.burgs[1].population = 95;
    expect(simulation.burgs[1].population).toBe(95);
    expect(world.pack.burgs[1].population).toBe(95);
  });

  it("stores the live burg state once in an archive and restores its legacy projection", () => {
    const world = createWorld();
    const simulation = createSimulation();
    bindSimulationBurgState(world, simulation);

    const document = createWorldDocument(world, simulation, createPresentationData(), []);

    expect(Object.hasOwn(document.world.pack.burgs[1], "population")).toBe(false);
    expect(Object.hasOwn(document.world.pack.burgs[1], "demographics")).toBe(false);
    expect(document.simulation.burgs[1].treasury).toBe(12);

    bindSimulationBurgState(document.world, document.simulation);
    expect(document.world.pack.burgs[1].population).toBe(80);
  });

  it("adopts burg values from an archive written before simulation owned burgs", () => {
    const world = createWorld();
    const simulation = createSimulation();
    delete (simulation as Partial<SimulationContext>).burgs;

    bindSimulationBurgState(world, simulation);

    expect(simulation.burgs[1].population).toBe(80);
    expect(world.pack.burgs[1].population).toBe(80);
  });

  it("projects a newly created burg without rebinding the full map", () => {
    const simulation = createSimulation();
    const burg: Burg = { i: 7, cell: 3, x: 1, y: 2, population: 40 };

    bindSimulationBurg(burg, 7, simulation);
    burg.treasury = 9;

    expect(simulation.burgs[7]).toMatchObject({ population: 40, treasury: 9 });
  });
});
