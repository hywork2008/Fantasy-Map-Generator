import { describe, expect, it } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import { createSimulationRngState } from "../runtime/simulationRng";
import { applySimulationTimeline } from "./simulationTimeline";

const savedSimulation = () => {
  const rng = createSimulationRngState("map-1");
  rng.streams = { "economy.tick": [1, 2, 3, 4] };
  return { rng } as unknown as SimulationContext;
};

describe("applySimulationTimeline", () => {
  it("keeps the saved RNG on continue", () => {
    const simulation = savedSimulation();
    const before = structuredClone(simulation.rng);
    expect(applySimulationTimeline(simulation, "map-1", { mode: "continue" })).toBe("map-1");
    expect(simulation.rng).toEqual(before);
  });

  it("starts a fresh, distinct timeline on new and drops saved system streams", () => {
    const first = savedSimulation();
    const second = savedSimulation();
    const a = applySimulationTimeline(first, "map-1", { mode: "new" });
    const b = applySimulationTimeline(second, "map-1", { mode: "new" });
    expect(a).not.toBe(b);
    expect(a.startsWith("map-1~")).toBe(true);
    expect(first.rng.seed).toBe(a);
    expect(first.rng.streams).toEqual({});
  });

  it("replays an explicit seed regardless of mode", () => {
    const first = savedSimulation();
    const second = savedSimulation();
    applySimulationTimeline(first, "map-1", { mode: "new", seed: "shared" });
    applySimulationTimeline(second, "map-1", { mode: "continue", seed: "shared" });
    expect(first.rng).toEqual(second.rng);
    expect(first.rng.seed).toBe("shared");
  });
});
