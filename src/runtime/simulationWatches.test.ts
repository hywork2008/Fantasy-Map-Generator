import { afterEach, describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { registerSimulationWatch } from "./simulationWatches";
import { createWorldRuntime } from "./worldRuntime";

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
});
describe("canonical time observation", () => {
  it("blocks direct commands without advancing the clock and publishes the saved stop", async () => {
    const simulation = { currentYear: 1000, currentMonth: 1, currentDay: 1, tickCount: 0 } as SimulationContext;
    const runtime = createWorldRuntime({} as WorldContext, simulation);
    runtime.registerSimulationStepDayHandler(() => {
      simulation.currentDay++;
      return {
        result: { year: 1000, month: 1, day: simulation.currentDay, tickCount: 1 },
        topics: ["simulation.clock"]
      };
    });
    cleanup = registerSimulationWatch({
      beforeStep: s => ({ allowed: s !== simulation, topics: ["extension.characters"] }),
      requiresDailySteps: () => true,
      paused: () => true
    });
    expect(await runtime.dispatch({ type: "simulation.stepDay" })).toBeNull();
    expect(simulation.currentDay).toBe(1);
    expect(runtime.read().topicRevisions["extension.characters"]).toBe(1);
  });
});
