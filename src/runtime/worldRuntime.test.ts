import { describe, expect, it, vi } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createWorldRuntime } from "./worldRuntime";

function createRuntime() {
  return createWorldRuntime({} as WorldContext, {} as SimulationContext);
}

function createPositionWorld(): WorldContext {
  return {
    pack: {
      markers: [{ i: 1, x: 4, y: 8, cell: 0 }],
      burgs: [{}, { i: 1, cell: 0, state: 1, x: 4, y: 8, capital: true }],
      states: [{ i: 0 }, { i: 1, center: 0, military: [{ i: 7, x: 4, y: 8 }] }],
      cells: { burg: new Uint16Array([1, 0]) }
    }
  } as unknown as WorldContext;
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

  it("updates bounded position commands by stable ID and emits their owned topics", async () => {
    const world = createPositionWorld();
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const markerCommit = await runtime.dispatch({
      type: "marker.move",
      payload: { markerId: 1, x: 10, y: 20, cellId: 1 }
    });
    const burgCommit = await runtime.dispatch({
      type: "burg.move",
      payload: { burgId: 1, cellId: 1, stateId: 1, x: 30, y: 40 }
    });
    const regimentCommit = await runtime.dispatch({
      type: "regiment.move",
      payload: { stateId: 1, regimentId: 7, x: 50, y: 60 }
    });

    expect(world.pack.markers[0]).toMatchObject({ x: 10, y: 20, cell: 1 });
    expect(world.pack.burgs[1]).toMatchObject({ cell: 1, state: 1, x: 30, y: 40 });
    expect(world.pack.cells.burg).toEqual(new Uint16Array([0, 1]));
    expect(world.pack.states[1].center).toBe(1);
    expect(world.pack.states[1].military?.[0]).toMatchObject({ x: 50, y: 60 });
    expect(markerCommit?.changes.changes).toEqual([{ topic: "map.annotations", kind: "replace" }]);
    expect(burgCommit?.changes.changes).toEqual([{ topic: "map.settlements", kind: "replace" }]);
    expect(regimentCommit?.changes.changes).toEqual([{ topic: "simulation.military", kind: "replace" }]);
  });
});
