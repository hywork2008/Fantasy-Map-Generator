import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { State } from "../types/models";
import { createPresentationData } from "./presentationData";
import { bindSimulationState, bindSimulationStateState } from "./simulationStateState";
import { createWorldDocument } from "./worldArchive";

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
          alert: 2,
          salesTax: 0.12,
          pollTax: 0.04,
          treasury: 90,
          manpowerReconciled: true
        }
      ]
    },
    grid: {},
    seed: "state-simulation",
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
  return { states: {} } as SimulationContext;
}

describe("simulation state compatibility adapter", () => {
  it("moves live state values into a stable-id simulation table while retaining legacy access", () => {
    const world = createWorld();
    const simulation = createSimulation();

    bindSimulationStateState(world, simulation);

    expect(simulation.states[1]).toMatchObject({ treasury: 90, manpowerReconciled: true });
    expect(Object.getOwnPropertyDescriptor(world.pack.states[1], "treasury")?.get).toBeTypeOf("function");

    world.pack.states[1].treasury = 125;
    expect(simulation.states[1].treasury).toBe(125);
    expect(world.pack.states[1].treasury).toBe(125);
  });

  it("stores live state values once in an archive and restores the legacy projection", () => {
    const world = createWorld();
    const simulation = createSimulation();
    bindSimulationStateState(world, simulation);

    const document = createWorldDocument(world, simulation, createPresentationData(), []);

    expect(Object.hasOwn(document.world.pack.states[1], "treasury")).toBe(false);
    expect(Object.hasOwn(document.world.pack.states[1], "manpowerReconciled")).toBe(false);
    expect(document.simulation.states[1].salesTax).toBe(0.12);

    bindSimulationStateState(document.world, document.simulation);
    expect(document.world.pack.states[1].treasury).toBe(90);
  });

  it("adopts state values from an archive written before simulation owned states", () => {
    const world = createWorld();
    const simulation = createSimulation();
    delete (simulation as Partial<SimulationContext>).states;

    bindSimulationStateState(world, simulation);

    expect(simulation.states[1].treasury).toBe(90);
    expect(world.pack.states[1].treasury).toBe(90);
  });

  it("projects a new or replaced state record without rebinding the full map", () => {
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
      treasury: 20
    };

    bindSimulationState(state, 7, simulation);
    state.supplyStrain = 0.4;

    expect(simulation.states[7]).toMatchObject({ treasury: 20, supplyStrain: 0.4 });
  });
});
