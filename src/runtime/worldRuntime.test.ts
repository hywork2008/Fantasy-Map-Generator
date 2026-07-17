import { describe, expect, it, vi } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createWorldRuntime } from "./worldRuntime";

function createRuntime() {
  return createWorldRuntime({} as WorldContext, {} as SimulationContext);
}

describe("WorldRuntime Phase 1 compatibility shell", () => {
  it("does not publish a commit or increment revisions for a no-op mutation", async () => {
    const runtime = createRuntime();
    const listener = vi.fn();
    runtime.subscribe(listener);

    const commit = await runtime.dispatch({
      type: "legacy.mutation",
      execute: () => ({ result: undefined, topics: [] })
    });

    expect(commit).toBeNull();
    expect(listener).not.toHaveBeenCalled();
    expect(runtime.read()).toMatchObject({ revision: 0, topicRevisions: {} });
  });

  it("publishes one revisioned, de-duplicated change set after a successful mutation", async () => {
    const runtime = createRuntime();
    const listener = vi.fn();
    runtime.subscribe(listener);

    const commit = await runtime.dispatch({
      type: "legacy.mutation",
      execute: () => ({
        result: "updated",
        topics: ["simulation.clock", "simulation.clock", "map.settlements"]
      })
    });

    expect(commit).toEqual({
      result: "updated",
      changes: {
        fromRevision: 0,
        toRevision: 1,
        fullReplace: false,
        changes: [
          { topic: "simulation.clock", kind: "replace" },
          { topic: "map.settlements", kind: "replace" }
        ]
      }
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(runtime.read()).toMatchObject({
      revision: 1,
      topicRevisions: { "simulation.clock": 1, "map.settlements": 1 }
    });
  });

  it("keeps a successful commit observable when another listener fails", async () => {
    const runtime = createRuntime();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const healthyListener = vi.fn();
    runtime.subscribe(() => {
      throw new Error("renderer failed");
    });
    runtime.subscribe(healthyListener);

    await runtime.dispatch({
      type: "legacy.mutation",
      execute: () => ({ result: undefined, topics: ["simulation.clock"] })
    });

    expect(healthyListener).toHaveBeenCalledTimes(1);
    expect(runtime.read().revision).toBe(1);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
