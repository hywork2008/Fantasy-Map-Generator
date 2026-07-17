import { describe, expect, it, vi } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createPresentationData } from "./presentationData";
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

function createPoliticsWorld(): WorldContext {
  return {
    notes: [
      { id: "regiment1-3", name: "First" },
      { id: "keep", name: "Keep" }
    ],
    pack: {
      markers: [],
      burgs: [{}, { i: 1, cell: 0, state: 1, culture: 1, capital: 1 }, { i: 2, cell: 2, state: 2, culture: 2 }],
      states: [
        { i: 0 },
        { i: 1, culture: 1, provinces: [1], military: [{ i: 3 }], neighbors: [2] },
        { i: 2, provinces: [], military: [{ i: 4, x: 8, y: 9 }], neighbors: [1] }
      ],
      provinces: [{}, { i: 1, state: 1 }],
      cultures: [{}, { i: 1 }, { i: 2 }],
      religions: [{}, { i: 1 }, { i: 2 }],
      cells: {
        burg: new Uint16Array([1, 0, 2]),
        state: new Uint16Array([1, 1, 2]),
        province: new Uint16Array([1, 1, 0]),
        culture: new Uint16Array([1, 1, 2]),
        religion: new Uint16Array([1, 1, 2])
      }
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

  it("commits registered extension writers under their extension topic", async () => {
    const runtime = createRuntime();
    let assignedCellId = 0;
    const unregister = runtime.registerExtensionCommand({
      extensionId: "economy",
      name: "goods.assignCell",
      topics: ["extension.economy", "map.settlements"],
      execute: payload => {
        if (!payload || typeof payload !== "object" || !Number.isInteger((payload as { cellId?: unknown }).cellId)) {
          throw new Error("cellId is required");
        }
        const cellId = (payload as { cellId: number }).cellId;
        if (assignedCellId === cellId) return { changed: false };
        assignedCellId = cellId;
        return { changed: true, result: { cellId } };
      }
    });

    const commit = await runtime.dispatch({
      type: "extension.command",
      payload: { extensionId: "economy", name: "goods.assignCell", payload: { cellId: 4 } }
    });
    const noOp = await runtime.dispatch({
      type: "extension.command",
      payload: { extensionId: "economy", name: "goods.assignCell", payload: { cellId: 4 } }
    });

    expect(assignedCellId).toBe(4);
    expect(commit).toMatchObject({
      result: { cellId: 4 },
      changes: {
        changes: [
          { topic: "extension.economy", kind: "replace" },
          { topic: "map.settlements", kind: "replace" }
        ]
      }
    });
    expect(noOp).toBeNull();
    unregister();
    await expect(
      runtime.dispatch({
        type: "extension.command",
        payload: { extensionId: "economy", name: "goods.assignCell", payload: { cellId: 5 } }
      })
    ).rejects.toThrow("is not registered");
  });

  it("runs the registered simulation implementation through simulation.advance", async () => {
    const runtime = createRuntime();
    const handler = vi.fn(() => ({ result: undefined, topics: ["simulation.clock", "simulation.cells"] as const }));
    runtime.registerSimulationAdvanceHandler(handler);

    const commit = await runtime.dispatch({
      type: "simulation.advance",
      payload: { deltaYears: 1, deltaMonths: 2, deltaDays: 3 }
    });

    expect(handler).toHaveBeenCalledWith({ deltaYears: 1, deltaMonths: 2, deltaDays: 3 });
    expect(commit?.changes.changes).toEqual([
      { topic: "simulation.clock", kind: "replace" },
      { topic: "simulation.cells", kind: "replace" }
    ]);
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

  it("patches and removes markers with their notes through annotation commands", async () => {
    const world = createPositionWorld();
    world.notes = [{ id: "marker1", name: "Old marker" }];
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const pinnedCommit = await runtime.dispatch({ type: "marker.patch", payload: { markerId: 1, pinned: true } });
    const lockCommit = await runtime.dispatch({ type: "marker.invertFlags", payload: { field: "lock" } });
    const removeCommit = await runtime.dispatch({ type: "marker.remove", payload: { markerId: 1 } });

    expect(pinnedCommit?.changes.changes).toEqual([{ topic: "map.annotations", kind: "replace" }]);
    expect(lockCommit?.changes.changes).toEqual([{ topic: "map.annotations", kind: "replace" }]);
    expect(removeCommit?.result).toEqual({ removedMarkerIds: [1] });
    expect(world.pack.markers).toEqual([]);
    expect(world.notes).toEqual([]);
  });

  it("assigns cell ownership atomically and preserves burg state / culture invariants", async () => {
    const world = createPoliticsWorld();
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const stateCommit = await runtime.dispatch({
      type: "cells.assign",
      payload: {
        field: "state",
        assignments: [
          { cellId: 0, entityId: 2 },
          { cellId: 0, entityId: 2 }
        ]
      }
    });
    const cultureCommit = await runtime.dispatch({
      type: "cells.assign",
      payload: { field: "culture", assignments: [{ cellId: 0, entityId: 2 }] }
    });

    expect(world.pack.cells.state[0]).toBe(2);
    expect(world.pack.burgs[1]).toMatchObject({ state: 2, culture: 2 });
    expect(stateCommit?.result).toEqual({ changedCellIds: [0] });
    expect(stateCommit?.changes.changes).toEqual([
      { topic: "map.politics", kind: "replace" },
      { topic: "map.settlements", kind: "replace" }
    ]);
    expect(cultureCommit?.changes.changes).toEqual([
      { topic: "map.politics", kind: "replace" },
      { topic: "map.settlements", kind: "replace" }
    ]);
  });

  it("rejects an invalid cell assignment before changing data or revisions", async () => {
    const world = createPoliticsWorld();
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    await expect(
      runtime.dispatch({
        type: "cells.assign",
        payload: {
          field: "province",
          assignments: [
            { cellId: 0, entityId: 1 },
            { cellId: 1, entityId: 99 }
          ]
        }
      })
    ).rejects.toThrow("could not find active province 99");

    expect(world.pack.cells.province).toEqual(new Uint16Array([1, 1, 0]));
    expect(runtime.read().revision).toBe(0);
  });

  it("removes a state with its data cascade in one commit", async () => {
    const world = createPoliticsWorld();
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const commit = await runtime.dispatch({ type: "state.remove", payload: { stateId: 1 } });

    expect(commit?.result).toEqual({
      stateId: 1,
      removedProvinceIds: [1],
      removedRegimentIds: [3],
      formerCapitalBurgIds: [1]
    });
    expect(world.pack.states[1]).toMatchObject({ i: 1, removed: true });
    expect(world.pack.states[2].neighbors).toEqual([]);
    expect(world.pack.cells.state).toEqual(new Uint16Array([0, 0, 2]));
    expect(world.pack.cells.province).toEqual(new Uint16Array([0, 0, 0]));
    expect(world.pack.provinces[1]).toMatchObject({ i: 1, removed: true });
    expect(world.pack.burgs[1]).toMatchObject({ state: 0, capital: 0 });
    expect(world.notes.map(note => note.id)).toEqual(["keep"]);
    expect(commit?.changes.changes).toEqual([
      { topic: "map.politics", kind: "replace" },
      { topic: "map.settlements", kind: "replace" },
      { topic: "simulation.military", kind: "replace" },
      { topic: "map.annotations", kind: "replace" }
    ]);
  });

  it("merges state data, remaps regiments and keeps province ownership coherent", async () => {
    const world = createPoliticsWorld();
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const commit = await runtime.dispatch({
      type: "state.merge",
      payload: { rulingStateId: 2, absorbedStateIds: [1] }
    });

    expect(commit?.result).toEqual({
      rulingStateId: 2,
      absorbedStateIds: [1],
      regimentMerges: [{ fromStateId: 1, fromRegimentId: 3, toRegimentId: 1 }],
      formerCapitalBurgIds: [1]
    });
    expect(world.pack.states[1]).toMatchObject({ i: 1, removed: true });
    expect(world.pack.states[2].military).toEqual([{ i: 4, x: 8, y: 9 }, { i: 1 }]);
    expect(world.pack.states[2].provinces).toEqual([1]);
    expect(world.pack.states[2].neighbors).toEqual([]);
    expect(world.pack.cells.state).toEqual(new Uint16Array([2, 2, 2]));
    expect(world.pack.provinces[1].state).toBe(2);
    expect(world.pack.burgs[1]).toMatchObject({ state: 2, capital: 0 });
    expect(world.notes.map(note => note.id)).toEqual(["regiment2-1", "keep"]);
    expect(commit?.changes.changes).toEqual([
      { topic: "map.politics", kind: "replace" },
      { topic: "map.settlements", kind: "replace" },
      { topic: "simulation.military", kind: "replace" },
      { topic: "map.annotations", kind: "replace" }
    ]);
  });

  it("removes province, culture and religion ownership through typed cascades", async () => {
    const provinceWorld = createPoliticsWorld();
    const provinceRuntime = createWorldRuntime(provinceWorld, {} as SimulationContext);
    const provinceCommit = await provinceRuntime.dispatch({
      type: "entity.remove",
      payload: { kind: "province", entityId: 1 }
    });

    expect(provinceWorld.pack.cells.province).toEqual(new Uint16Array([0, 0, 0]));
    expect(provinceWorld.pack.provinces[1]).toMatchObject({ i: 1, removed: true });
    expect(provinceWorld.pack.states[1].provinces).toEqual([]);
    expect(provinceCommit?.changes.changes).toEqual([{ topic: "map.politics", kind: "replace" }]);

    const cultureWorld = createPoliticsWorld();
    const cultureRuntime = createWorldRuntime(cultureWorld, {} as SimulationContext);
    const cultureCommit = await cultureRuntime.dispatch({
      type: "entity.remove",
      payload: { kind: "culture", entityId: 1 }
    });

    expect(cultureWorld.pack.cells.culture).toEqual(new Uint16Array([0, 0, 2]));
    expect(cultureWorld.pack.burgs[1].culture).toBe(0);
    expect(cultureWorld.pack.states[1].culture).toBe(0);
    expect(cultureWorld.pack.cultures[1]).toMatchObject({ i: 1, removed: true });
    expect(cultureCommit?.changes.changes).toEqual([
      { topic: "map.politics", kind: "replace" },
      { topic: "map.settlements", kind: "replace" }
    ]);

    const religionWorld = createPoliticsWorld();
    const religionRuntime = createWorldRuntime(religionWorld, {} as SimulationContext);
    const religionCommit = await religionRuntime.dispatch({
      type: "entity.remove",
      payload: { kind: "religion", entityId: 1 }
    });

    expect(religionWorld.pack.cells.religion).toEqual(new Uint16Array([0, 0, 2]));
    expect(religionWorld.pack.religions[1]).toMatchObject({ i: 1, removed: true });
    expect(religionCommit?.changes.changes).toEqual([{ topic: "map.politics", kind: "replace" }]);
  });

  it("creates, patches and removes routes with their cell adjacency", async () => {
    const world = {
      pack: {
        routes: [
          {
            i: 1,
            group: "roads",
            points: [
              [0, 0, 0],
              [1, 1, 1]
            ]
          }
        ],
        cells: {
          i: new Uint16Array([0, 1, 2]),
          routes: { 0: { 1: 1 }, 1: { 0: 1 } }
        }
      }
    } as unknown as WorldContext;
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const patchCommit = await runtime.dispatch({
      type: "route.patch",
      payload: { routeId: 1, name: "Royal Road", lock: true }
    });
    const createCommit = await runtime.dispatch({
      type: "route.create",
      payload: {
        route: {
          i: 2,
          group: "trails",
          feature: 0,
          points: [
            [1, 1, 1],
            [2, 2, 2]
          ]
        }
      }
    });
    const replaceCommit = await runtime.dispatch({
      type: "route.replacePoints",
      payload: {
        routeId: 2,
        points: [
          [0, 0, 0],
          [2, 2, 2]
        ]
      }
    });
    const removeCommit = await runtime.dispatch({ type: "route.remove", payload: { routeId: 1 } });

    expect(world.pack.routes).toEqual([
      {
        i: 2,
        group: "trails",
        feature: 0,
        points: [
          [0, 0, 0],
          [2, 2, 2]
        ]
      }
    ]);
    expect(world.pack.cells.routes).toEqual({ 0: { 2: 2 }, 1: {}, 2: { 0: 2 } });
    expect(patchCommit?.changes.changes).toEqual([{ topic: "map.networks", kind: "replace" }]);
    expect(createCommit?.changes.changes).toEqual([{ topic: "map.networks", kind: "replace" }]);
    expect(replaceCommit?.changes.changes).toEqual([{ topic: "map.networks", kind: "replace" }]);
    expect(removeCommit?.changes.changes).toEqual([{ topic: "map.networks", kind: "replace" }]);
  });

  it("patches river metadata and derives its basin from the selected parent", async () => {
    const world = {
      pack: {
        rivers: [
          { i: 1, name: "Parent", type: "River", basin: 1, sourceWidth: 0.5, widthFactor: 1 },
          { i: 2, name: "Child", type: "River", parent: 2, basin: 2, sourceWidth: 0.5, widthFactor: 1 }
        ]
      }
    } as unknown as WorldContext;
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const commit = await runtime.dispatch({
      type: "river.patch",
      payload: { riverId: 2, name: "New Child", parentId: 1, sourceWidth: 2, widthFactor: 1.5 }
    });

    expect(world.pack.rivers[1]).toMatchObject({
      name: "New Child",
      parent: 1,
      basin: 1,
      sourceWidth: 2,
      widthFactor: 1.5
    });
    expect(commit?.changes.changes).toEqual([{ topic: "map.networks", kind: "replace" }]);
  });

  it("replaces river geometry and synchronizes river cell ownership", async () => {
    const world = {
      pack: {
        rivers: [
          {
            i: 1,
            cells: [0, 1],
            points: [
              [0, 0],
              [1, 1]
            ]
          }
        ],
        cells: { i: new Uint16Array([0, 1, 2]), r: new Uint16Array([1, 1, 0]) }
      }
    } as unknown as WorldContext;
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const commit = await runtime.dispatch({
      type: "river.replaceGeometry",
      payload: {
        riverId: 1,
        points: [
          [1, 1],
          [2, 2]
        ],
        cellIds: [1, 2]
      }
    });

    expect(world.pack.rivers[0]).toMatchObject({
      cells: [1, 2],
      points: [
        [1, 1],
        [2, 2]
      ]
    });
    expect(world.pack.cells.r).toEqual(new Uint16Array([0, 1, 1]));
    expect(commit?.changes.changes).toEqual([{ topic: "map.networks", kind: "replace" }]);
  });

  it("patches persisted lake or coastline feature metadata", async () => {
    const world = { pack: { features: [{}, { i: 1, name: "Old", group: "freshwater" }] } } as unknown as WorldContext;
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const commit = await runtime.dispatch({
      type: "feature.patch",
      payload: { featureId: 1, name: "Moon Lake", group: "sacred" }
    });

    expect(world.pack.features[1]).toMatchObject({ name: "Moon Lake", group: "sacred" });
    expect(commit?.changes.changes).toEqual([{ topic: "map.topology", kind: "replace" }]);
  });

  it("moves a feature vertex and updates the canonical feature area", async () => {
    const world = {
      pack: {
        features: [{}, { i: 1, vertices: [0, 1, 2], area: 0 }],
        vertices: {
          p: [
            [0, 0],
            [2, 0],
            [0, 2]
          ]
        }
      }
    } as unknown as WorldContext;
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const commit = await runtime.dispatch({
      type: "feature.vertexMove",
      payload: { featureId: 1, vertexId: 2, x: 0, y: 3 }
    });

    expect(world.pack.vertices.p[2]).toEqual([0, 3]);
    expect(world.pack.features[1].area).toBe(3);
    expect(commit?.changes.changes).toEqual([{ topic: "map.topology", kind: "replace" }]);
  });

  it("commits persisted style and layer visibility together without exposing DOM state", async () => {
    const presentation = createPresentationData();
    const runtime = createWorldRuntime({} as WorldContext, {} as SimulationContext, presentation);

    const commit = await runtime.dispatch({
      type: "presentation.patch",
      payload: {
        styles: { "#rivers": { fill: "#123456", opacity: 0.5 } },
        activeLayers: { toggleRivers: true }
      }
    });

    expect(commit?.changes.changes).toEqual([
      { topic: "presentation.styles", kind: "replace" },
      { topic: "presentation.layers", kind: "replace" }
    ]);
    expect(runtime.read().presentation).toEqual({
      styles: { "#rivers": { fill: "#123456", opacity: 0.5 } },
      activeLayers: { toggleRivers: true }
    });

    const noOp = await runtime.dispatch({
      type: "presentation.patch",
      payload: { styles: { "#rivers": { fill: "#123456" } }, activeLayers: { toggleRivers: true } }
    });
    expect(noOp).toBeNull();
  });
});
