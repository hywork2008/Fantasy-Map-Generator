import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { MilitaryRegiment, State } from "../types/models";
import { createPresentationData } from "./presentationData";
import { bindSimulationMilitaryRoster, bindSimulationMilitaryState } from "./simulationMilitaryState";
import { createWorldDocument } from "./worldArchive";

function createRegiment(): MilitaryRegiment {
  return {
    i: 1,
    t: 100,
    name: "First Guard",
    a: 100,
    s: 100,
    cell: 3,
    x: 10,
    y: 20,
    bx: 10,
    by: 20,
    u: { infantry: 100 },
    n: 0,
    type: "infantry",
    state: 1
  };
}

function createWorld(): WorldContext {
  return {
    pack: {
      states: [
        { i: 0, name: "Neutrals" },
        {
          i: 1,
          name: "Aster",
          expansionism: 1,
          capital: 1,
          type: "Generic",
          center: 3,
          culture: 1,
          coa: null,
          military: [createRegiment()]
        }
      ]
    },
    grid: {},
    seed: "military-simulation",
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
  return { military: {} } as SimulationContext;
}

describe("simulation military compatibility adapter", () => {
  it("moves regiments into an owner-state roster while retaining legacy array access", () => {
    const world = createWorld();
    const simulation = createSimulation();

    bindSimulationMilitaryState(world, simulation);

    expect(simulation.military[1][0].name).toBe("First Guard");
    expect(Object.getOwnPropertyDescriptor(world.pack.states[1], "military")?.get).toBeTypeOf("function");

    world.pack.states[1].military?.push({ ...createRegiment(), i: 2, name: "Second Guard" });
    expect(simulation.military[1]).toHaveLength(2);
  });

  it("stores each roster once in an archive and restores its legacy projection", () => {
    const world = createWorld();
    const simulation = createSimulation();
    bindSimulationMilitaryState(world, simulation);

    const document = createWorldDocument(world, simulation, createPresentationData(), []);

    expect(Object.hasOwn(document.world.pack.states[1], "military")).toBe(false);
    expect(document.simulation.military[1][0].state).toBe(1);

    bindSimulationMilitaryState(document.world, document.simulation);
    expect(document.world.pack.states[1].military).toBe(document.simulation.military[1]);
  });

  it("adopts a military roster from an archive written before simulation owned regiments", () => {
    const world = createWorld();
    const simulation = createSimulation();
    delete (simulation as Partial<SimulationContext>).military;

    bindSimulationMilitaryState(world, simulation);

    expect(simulation.military[1][0].a).toBe(100);
  });

  it("projects a new or replaced state roster without rebinding the full map", () => {
    const simulation = createSimulation();
    const state: State = {
      i: 7,
      name: "Beryl",
      expansionism: 1,
      capital: 2,
      type: "Generic",
      center: 4,
      culture: 1,
      coa: null,
      military: [createRegiment()]
    };

    bindSimulationMilitaryRoster(state, 7, simulation);
    state.military = [];

    expect(simulation.military[7]).toEqual([]);
  });
});
