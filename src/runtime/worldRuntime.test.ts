import { describe, expect, it, vi } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createPresentationData } from "./presentationData";
import { assertValidWorldDocument, createWorldDocument, type ValidatedWorld } from "./worldArchive";
import { createWorldRuntime } from "./worldRuntime";

function createRuntime() {
  return createWorldRuntime({} as WorldContext, {} as SimulationContext);
}

function createPositionWorld(): WorldContext {
  return {
    grid: {},
    notes: [],
    pack: {
      markers: [{ i: 1, x: 4, y: 8, cell: 0 }],
      burgs: [{}, { i: 1, cell: 0, state: 1, x: 4, y: 8, capital: true }],
      states: [{ i: 0 }, { i: 1, center: 0, military: [{ i: 7, x: 4, y: 8 }] }],
      cultures: [{ i: 0 }, { i: 1 }],
      cells: { i: new Uint16Array([0, 1]), burg: new Uint16Array([1, 0]) }
    }
  } as unknown as WorldContext;
}

function createPoliticsWorld(): WorldContext {
  return {
    grid: {},
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

  it("runs simulation.stepDay through a dedicated one-day handler", async () => {
    const runtime = createRuntime();
    const handler = vi.fn(() => ({
      result: { tickCount: 4, year: 100, month: 2, day: 5 },
      topics: ["simulation.clock"] as const
    }));
    runtime.registerSimulationStepDayHandler(handler);

    const commit = await runtime.dispatch({ type: "simulation.stepDay" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(commit?.result).toEqual({ tickCount: 4, year: 100, month: 2, day: 5 });
    expect(commit?.changes.changes).toEqual([{ topic: "simulation.clock", kind: "replace" }]);
  });

  it("runs the registered heightmap finalizer through one revisioned command", async () => {
    const runtime = createRuntime();
    const handler = vi.fn(() => ({ result: [7], topics: ["map.physical", "map.topology"] as const }));
    const unregister = runtime.registerHeightmapFinalizeHandler(handler);

    const commit = await runtime.dispatch({ type: "heightmap.finalize", payload: { mode: "risk" } });

    expect(handler).toHaveBeenCalledWith({ mode: "risk" });
    expect(commit?.result).toEqual([7]);
    expect(commit?.changes.changes).toEqual([
      { topic: "map.physical", kind: "replace" },
      { topic: "map.topology", kind: "replace" }
    ]);

    unregister();
    await expect(runtime.dispatch({ type: "heightmap.finalize", payload: { mode: "keep" } })).rejects.toThrow(
      "has no registered handler"
    );
  });

  it("atomically replaces world, simulation and presentation data through a full-replace commit", async () => {
    const world = createPositionWorld();
    const simulation = { currentYear: 10, currentMonth: 1, currentDay: 1, tickCount: 1 } as SimulationContext;
    const presentation = createPresentationData();
    const runtime = createWorldRuntime(world, simulation, presentation);
    const packReference = world.pack;
    const gridReference = world.grid;
    const document = createWorldDocument(
      {
        ...createPositionWorld(),
        mapId: 200,
        seed: "replaced"
      },
      { currentYear: 99, currentMonth: 4, currentDay: 5, tickCount: 9 } as SimulationContext,
      {
        styles: { "#statesBody": { fill: "red" }, "#scaleBar": { "data-x": 10 } },
        activeLayers: { toggleStates: true },
        layerOrder: ["toggleRivers", "toggleStates"],
        labels: { stateLabel1: { dx: 12, dy: -4 } },
        overlays: { scaleBar: { "data-x": 10 } }
      },
      []
    );

    const commit = await runtime.dispatch({
      type: "world.replace",
      payload: { stage: "validated", document } satisfies ValidatedWorld
    });

    expect(commit?.changes.fullReplace).toBe(true);
    expect(world.pack).toBe(packReference);
    expect(world.grid).toBe(gridReference);
    expect(world.mapId).toBe(200);
    expect(world.seed).toBe("replaced");
    expect(simulation.currentYear).toBe(99);
    expect(presentation.styles).toEqual({ "#statesBody": { fill: "red" }, "#scaleBar": { "data-x": 10 } });
    expect(presentation.activeLayers).toEqual({ toggleStates: true });
    expect(presentation.layerOrder).toEqual(["toggleRivers", "toggleStates"]);
    expect(presentation.labels).toEqual({ stateLabel1: { dx: 12, dy: -4 } });
    expect(presentation.overlays).toEqual({ scaleBar: { "data-x": 10 } });
  });

  it("rejects an invalid replacement before mutating the live world", async () => {
    const world = createPositionWorld();
    const simulation = { currentYear: 10, currentMonth: 1, currentDay: 1, tickCount: 1 } as SimulationContext;
    const presentation = createPresentationData();
    const runtime = createWorldRuntime(world, simulation, presentation);
    const document = createWorldDocument(
      { ...createPositionWorld(), mapId: 200, seed: "invalid" },
      { currentYear: 99, currentMonth: 4, currentDay: 5, tickCount: 9 } as SimulationContext,
      createPresentationData(),
      []
    );
    (document.world.pack as unknown as Record<string, unknown>).burgs = null;

    await expect(
      runtime.dispatch({ type: "world.replace", payload: { stage: "validated", document } })
    ).rejects.toThrow("Archive world state is incomplete");
    expect(world.mapId).not.toBe(200);
    expect(world.seed).not.toBe("invalid");
    expect(simulation.currentYear).toBe(10);
  });

  it("preserves opaque extension references when a core deletion is attempted", async () => {
    const world = createPoliticsWorld();
    const simulation = { currentYear: 10, currentMonth: 1, currentDay: 1, tickCount: 1 } as SimulationContext;
    const runtime = createWorldRuntime(world, simulation);
    const opaque = {
      extensionId: "uninstalled-extension",
      schemaVersion: 1,
      mediaType: "application/octet-stream",
      bytes: new Uint8Array(),
      checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      coreReferences: [{ kind: "state" as const, id: 1, onDelete: "restrict" as const }]
    };
    const document = createWorldDocument(
      { ...createPoliticsWorld(), mapId: 201, seed: "opaque-references" },
      { currentYear: 10, currentMonth: 1, currentDay: 1, tickCount: 1 } as SimulationContext,
      createPresentationData(),
      [opaque]
    );

    expect(document.world.mapId).toBe(201);
    expect(document.world.seed).toBe("opaque-references");
    expect(document.world.pack).toBeDefined();
    assertValidWorldDocument(document);
    await runtime.dispatch({ type: "world.replace", payload: { stage: "validated", document } });
    await expect(runtime.dispatch({ type: "state.remove", payload: { stateId: 1 } })).rejects.toThrow(
      "uninstalled-extension restricts that reference"
    );
    expect(world.pack.states[1]?.removed).not.toBe(true);
    expect(Array.from(world.pack.cells.state)).toEqual([1, 1, 2]);

    const unknownDocument = createWorldDocument(
      { ...createPoliticsWorld(), mapId: 202, seed: "opaque-unknown-references" },
      { currentYear: 10, currentMonth: 1, currentDay: 1, tickCount: 1 } as SimulationContext,
      createPresentationData(),
      [{ ...opaque, coreReferences: "unknown" as const }]
    );
    await runtime.dispatch({ type: "world.replace", payload: { stage: "validated", document: unknownDocument } });
    await expect(
      runtime.dispatch({ type: "entity.remove", payload: { kind: "culture", entityId: 1 } })
    ).rejects.toThrow("has unknown references");
    expect(world.pack.cultures[1]?.removed).not.toBe(true);

    const orphanDocument = createWorldDocument(
      { ...createPoliticsWorld(), mapId: 203, seed: "opaque-orphan-reference" },
      { currentYear: 10, currentMonth: 1, currentDay: 1, tickCount: 1 } as SimulationContext,
      createPresentationData(),
      [{ ...opaque, coreReferences: [{ kind: "culture" as const, id: 1, onDelete: "orphan" as const }] }]
    );
    await runtime.dispatch({ type: "world.replace", payload: { stage: "validated", document: orphanDocument } });
    await runtime.dispatch({ type: "entity.remove", payload: { kind: "culture", entityId: 1 } });
    expect(world.pack.cultures[1]?.removed).toBe(true);
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
    const burgPatchCommit = await runtime.dispatch({
      type: "burg.patch",
      payload: {
        burgId: 1,
        name: "New Name",
        type: "Naval",
        culture: 1,
        lock: true,
        link: "https://example.test",
        facilities: { citadel: true, walls: false }
      }
    });
    const regimentCommit = await runtime.dispatch({
      type: "regiment.move",
      payload: { stateId: 1, regimentId: 7, x: 50, y: 60 }
    });

    expect(world.pack.markers[0]).toMatchObject({ x: 10, y: 20, cell: 1 });
    expect(world.pack.burgs[1]).toMatchObject({
      cell: 1,
      state: 1,
      x: 30,
      y: 40,
      name: "New Name",
      type: "Naval",
      culture: 1,
      lock: true,
      link: "https://example.test",
      citadel: 1,
      walls: 0
    });
    expect(world.pack.cells.burg).toEqual(new Uint16Array([0, 1]));
    expect(world.pack.states[1].center).toBe(1);
    expect(world.pack.states[1].military?.[0]).toMatchObject({ x: 50, y: 60 });
    expect(markerCommit?.changes.changes).toEqual([{ topic: "map.annotations", kind: "replace" }]);
    expect(burgCommit?.changes.changes).toEqual([
      { topic: "map.settlements", kind: "replace" },
      { topic: "map.politics", kind: "replace" }
    ]);
    expect(burgPatchCommit?.changes.changes).toEqual([{ topic: "map.settlements", kind: "replace" }]);
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

  it("creates a marker and its note through one annotation commit", async () => {
    const world = createPositionWorld();
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const commit = await runtime.dispatch({
      type: "marker.create",
      payload: {
        marker: { i: 2, cell: 1, x: 10, y: 20, icon: "⚔️", type: "battlefields" },
        note: { id: "marker2", name: "Battle", legend: "A battle was fought" }
      }
    });

    expect(commit?.result).toMatchObject({ i: 2, cell: 1, icon: "⚔️" });
    expect(commit?.changes.changes).toEqual([{ topic: "map.annotations", kind: "replace" }]);
    expect(world.pack.markers.at(-1)).toMatchObject({ i: 2, cell: 1, type: "battlefields" });
    expect(world.notes).toContainEqual({ id: "marker2", name: "Battle", legend: "A battle was fought" });
  });

  it("rejects a duplicate marker without changing its annotation data", async () => {
    const world = createPositionWorld();
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    await expect(
      runtime.dispatch({
        type: "marker.create",
        payload: { marker: { i: 1, cell: 1, icon: "⚔️", type: "battlefields" } }
      })
    ).rejects.toThrow("duplicate marker 1");

    expect(world.pack.markers).toHaveLength(1);
    expect(world.notes).toEqual([]);
  });

  it("removes a non-capital burg, its cell ownership and its note through one command", async () => {
    const world = createPositionWorld();
    world.pack.burgs[1].capital = 0;
    world.pack.burgs[1].coa = {} as never;
    world.notes = [{ id: "burg1", name: "Old burg" }];
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const commit = await runtime.dispatch({ type: "burg.remove", payload: { burgId: 1 } });

    expect(world.pack.cells.burg).toEqual(new Uint16Array([0, 0]));
    expect(world.pack.burgs[1]).toMatchObject({ removed: true });
    expect(world.pack.burgs[1].coa).toBeUndefined();
    expect(world.notes).toEqual([]);
    expect(commit?.result).toEqual({ burgId: 1, removedCoa: true });
    expect(commit?.changes.changes).toEqual([
      { topic: "map.settlements", kind: "replace" },
      { topic: "map.annotations", kind: "replace" },
      { topic: "simulation.burgs", kind: "replace" }
    ]);
  });

  it("creates, patches and removes zones through the annotation topic", async () => {
    const world = createPositionWorld();
    world.pack.cells.i = new Uint16Array([0, 1]);
    world.pack.zones = [];
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const createCommit = await runtime.dispatch({
      type: "zone.create",
      payload: { name: "North", type: "Climate", color: "#123456" }
    });
    expect(createCommit?.result).toMatchObject({ i: 0, name: "North", cells: [] });
    const patchCommit = await runtime.dispatch({
      type: "zone.patch",
      payload: { zoneId: 0, name: "Northern", hidden: true, cells: [1, 0, 1] }
    });
    expect(world.pack.zones).toEqual([
      { i: 0, name: "Northern", type: "Climate", color: "#123456", hidden: true, cells: [1, 0] }
    ]);
    const removeCommit = await runtime.dispatch({ type: "zone.remove", payload: { zoneId: 0 } });

    expect(patchCommit?.changes.changes).toEqual([{ topic: "map.annotations", kind: "replace" }]);
    expect(world.pack.zones).toEqual([]);
    expect(removeCommit?.changes.changes).toEqual([{ topic: "map.annotations", kind: "replace" }]);
  });

  it("patches state editor fields through the politics topic", async () => {
    const world = createPoliticsWorld();
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const commit = await runtime.dispatch({
      type: "state.patch",
      payload: {
        stateId: 1,
        name: "Northreach",
        fullName: "Kingdom of Northreach",
        form: "Monarchy",
        formName: "Kingdom",
        color: "#336699",
        culture: 2,
        type: "Naval",
        expansionism: 3,
        lock: true
      }
    });

    expect(world.pack.states[1]).toMatchObject({
      name: "Northreach",
      fullName: "Kingdom of Northreach",
      form: "Monarchy",
      formName: "Kingdom",
      color: "#336699",
      culture: 2,
      type: "Naval",
      expansionism: 3,
      lock: true
    });
    expect(commit?.changes.changes).toEqual([{ topic: "map.politics", kind: "replace" }]);
  });

  it("patches religion editor metadata through the politics topic", async () => {
    const world = createPoliticsWorld();
    world.pack.religions[1] = {
      i: 1,
      name: "Old Faith",
      type: "Folk",
      form: "Animism",
      culture: 1,
      center: 0,
      deity: null,
      expansion: "culture",
      expansionism: 1,
      color: "#000000"
    };
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const commit = await runtime.dispatch({
      type: "religion.patch",
      payload: {
        religionId: 1,
        name: "New Faith",
        code: "NF",
        type: "Organized",
        form: "Monotheism",
        deity: "The One",
        color: "#123456",
        expansion: "state",
        expansionism: 3,
        lock: true
      }
    });

    expect(world.pack.religions[1]).toMatchObject({
      name: "New Faith",
      code: "NF",
      type: "Organized",
      form: "Monotheism",
      deity: "The One",
      color: "#123456",
      expansion: "state",
      expansionism: 3,
      lock: true
    });
    expect(commit?.changes.changes).toEqual([{ topic: "map.politics", kind: "replace" }]);
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

  it("removes river tributaries and resets their owned cell columns through one network commit", async () => {
    const world = {
      grid: { cells: { prec: new Uint8Array([4, 5, 6, 7]) } },
      pack: {
        rivers: [
          { i: 1, parent: 1, basin: 1 },
          { i: 2, parent: 1, basin: 1 },
          { i: 3, parent: 3, basin: 3 }
        ],
        cells: {
          r: new Uint16Array([1, 2, 3, 0]),
          fl: new Uint16Array([40, 50, 60, 70]),
          conf: new Uint8Array([1, 1, 1, 0]),
          g: new Uint16Array([0, 1, 2, 3])
        }
      }
    } as unknown as WorldContext;
    const runtime = createWorldRuntime(world, {} as SimulationContext);

    const removeCommit = await runtime.dispatch({ type: "river.remove", payload: { riverId: 1 } });

    expect(removeCommit?.result).toEqual({ riverIds: [1, 2] });
    expect(world.pack.rivers.map(river => river.i)).toEqual([3]);
    expect(Array.from(world.pack.cells.r)).toEqual([0, 0, 3, 0]);
    expect(Array.from(world.pack.cells.fl)).toEqual([4, 5, 60, 70]);
    expect(Array.from(world.pack.cells.conf)).toEqual([0, 0, 1, 0]);
    expect(removeCommit?.changes.changes).toEqual([{ topic: "map.networks", kind: "replace" }]);

    const clearCommit = await runtime.dispatch({ type: "river.clear" });
    expect(clearCommit?.result).toEqual({ riverIds: [3] });
    expect(world.pack.rivers).toEqual([]);
    expect(Array.from(world.pack.cells.r)).toEqual([0, 0, 0, 0]);
    expect(Array.from(world.pack.cells.fl)).toEqual([4, 5, 6, 70]);
    expect(Array.from(world.pack.cells.conf)).toEqual([0, 0, 0, 0]);
  });

  it("creates a river and updates creator flux through the network topic", async () => {
    const world = {
      pack: {
        rivers: [],
        cells: {
          i: new Uint16Array([0, 1, 2]),
          r: new Uint16Array([0, 9, 0]),
          fl: new Uint16Array([3, 4, 5])
        }
      }
    } as unknown as WorldContext;
    const runtime = createWorldRuntime(world, {} as SimulationContext);
    const river = {
      i: 1,
      source: 0,
      mouth: 2,
      discharge: 5,
      length: 2,
      width: 1,
      widthFactor: 1,
      sourceWidth: 0.5,
      parent: 1,
      basin: 1,
      name: "New River",
      type: "River",
      cells: [0, 1, 2]
    };

    const createCommit = await runtime.dispatch({ type: "river.create", payload: { river } });
    const fluxCommit = await runtime.dispatch({ type: "river.setFlux", payload: { cellId: 2, value: 8 } });

    expect(world.pack.rivers).toEqual([river]);
    expect(Array.from(world.pack.cells.r)).toEqual([1, 9, 1]);
    expect(world.pack.cells.fl[2]).toBe(8);
    expect(createCommit?.changes.changes).toEqual([{ topic: "map.networks", kind: "replace" }]);
    expect(fluxCommit?.changes.changes).toEqual([{ topic: "map.networks", kind: "replace" }]);
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
    expect(runtime.readTrusted().presentation).toEqual({
      styles: { "#rivers": { fill: "#123456", opacity: 0.5 } },
      activeLayers: { toggleRivers: true },
      layerOrder: [],
      labels: {},
      overlays: {}
    });

    const noOp = await runtime.dispatch({
      type: "presentation.patch",
      payload: { styles: { "#rivers": { fill: "#123456" } }, activeLayers: { toggleRivers: true } }
    });
    expect(noOp).toBeNull();
  });

  it("commits layer order and overlay layout as first-class presentation slices", async () => {
    const presentation = createPresentationData();
    const runtime = createWorldRuntime({} as WorldContext, {} as SimulationContext, presentation);

    const commit = await runtime.dispatch({
      type: "presentation.patch",
      payload: {
        layerOrder: ["toggleBiomes", "toggleStates"],
        styles: { "#scaleBar": { "data-x": 42, "data-y": 8 } },
        overlays: { compassRose: { transform: "translate(10 20) scale(0.5)" } }
      }
    });

    expect(commit?.changes.changes).toEqual([
      { topic: "presentation.styles", kind: "replace" },
      { topic: "presentation.layers", kind: "replace" },
      { topic: "presentation.overlays", kind: "replace" }
    ]);
    expect(presentation.layerOrder).toEqual(["toggleBiomes", "toggleStates"]);
    // Style patches for known chrome selectors mirror into overlays.
    expect(presentation.overlays.scaleBar).toEqual({ "data-x": 42, "data-y": 8 });
    // Overlay patches also mirror into styles for SVG projection.
    expect(presentation.styles["#compass > use"]).toEqual({ transform: "translate(10 20) scale(0.5)" });
    expect(presentation.overlays.compassRose).toEqual({ transform: "translate(10 20) scale(0.5)" });
  });
});
