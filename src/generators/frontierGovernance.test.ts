import { describe, expect, it } from "vitest";
import {
  createEmptyFrontierSimulationState,
  FRONTIER_STAGE,
  type SimulationContext
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createRNGService } from "../utils/probabilityUtils";
import { advanceFrontierGovernance, assessFrontierSupport, getFrontierGovernance } from "./frontierGovernance";

function createWorld(): WorldContext {
  return {
    pack: {
      cells: {
        i: new Uint16Array([0]),
        pop: new Float32Array([8]),
        capacity: new Float32Array([10]),
        danger: new Uint8Array([130]),
        s: new Uint8Array([20]),
        fl: new Uint16Array([0])
      },
      states: [{ i: 0 }, { i: 1, name: "Aster", treasury: 60, removed: false }]
    }
  } as unknown as WorldContext;
}

function createSimulation(): SimulationContext {
  const frontier = createEmptyFrontierSimulationState(1);
  frontier.budgetByState[1] = 60;
  frontier.cellStages[0] = FRONTIER_STAGE.outpost;
  frontier.projects[0] = {
    cellId: 0,
    stateId: 1,
    stage: FRONTIER_STAGE.outpost,
    establishedYear: 100,
    supportYears: 0,
    failedSupportYears: 0
  };
  return { currentYear: 101, currentMonth: 1, currentDay: 1, frontier } as SimulationContext;
}

describe("frontier governance", () => {
  it("turns frontier danger into a fort-first annual AI investment", () => {
    const world = createWorld();
    const simulation = createSimulation();

    expect(
      advanceFrontierGovernance(
        world,
        simulation,
        createRNGService(() => 0.5)
      )
    ).toBe(true);
    const governance = getFrontierGovernance(simulation, 1);
    expect(governance.policy).toBe("defense");
    expect(governance.investments.fort).toBe(1);
    expect(world.pack.states[1]?.treasury).toBe(54);
  });

  it("records drought recovery and lets a well reduce its cost", () => {
    const world = createWorld();
    const simulation = createSimulation();
    const project = simulation.frontier.projects[0]!;
    const bare = assessFrontierSupport(
      world,
      simulation,
      project,
      60,
      createRNGService(() => 0)
    );

    const governance = getFrontierGovernance(simulation, 1);
    governance.investments.well = 1;
    const protectedAssessment = assessFrontierSupport(
      world,
      simulation,
      project,
      60,
      createRNGService(() => 0)
    );

    expect(bare.disaster).toBe("drought");
    expect(bare.recoveryCost).toBeGreaterThan(protectedAssessment.recoveryCost);
  });
});
