import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createPresentationData } from "./presentationData";
import { createRenderCoordinator, type RenderEffects } from "./renderCoordinator";
import { createWorldRuntime } from "./worldRuntime";

function createEffects(): RenderEffects {
  return {
    syncPresentation: vi.fn(),
    renderFullWorld: vi.fn(),
    renderBorders: vi.fn(),
    renderStateLabels: vi.fn(),
    renderBurgIcons: vi.fn(),
    renderBurgLabels: vi.fn(),
    renderMarkers: vi.fn(),
    renderMilitary: vi.fn(),
    scheduleWebglUpdate: vi.fn(),
    scheduleLandTopologyProjection: vi.fn(),
    schedule3dTerrainUpdate: vi.fn(),
    schedule3dSceneUpdate: vi.fn(),
    refreshEditors: vi.fn(),
    refreshMilitary: vi.fn()
  };
}

describe("RenderCoordinator", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("maps a commit to only its dependent legacy renderer work", async () => {
    const runtime = createWorldRuntime({} as WorldContext, {} as SimulationContext);
    const effects = createEffects();
    createRenderCoordinator(runtime, effects);

    await runtime.dispatch({
      type: "legacy.mutation",
      execute: () => ({ result: undefined, topics: ["map.politics", "map.settlements", "simulation.military"] })
    });

    expect(effects.renderBorders).toHaveBeenCalledOnce();
    expect(effects.renderStateLabels).toHaveBeenCalledOnce();
    expect(effects.renderBurgIcons).toHaveBeenCalledOnce();
    expect(effects.renderBurgLabels).toHaveBeenCalledOnce();
    expect(effects.renderMilitary).toHaveBeenCalledOnce();
    expect(effects.scheduleWebglUpdate).toHaveBeenCalledOnce();
    expect(effects.schedule3dTerrainUpdate).toHaveBeenCalledOnce();
    expect(effects.schedule3dSceneUpdate).toHaveBeenCalledOnce();
    expect(effects.refreshEditors).toHaveBeenCalledOnce();
    expect(effects.refreshMilitary).toHaveBeenCalledOnce();
  });

  it("does not redraw map layers for a clock-only commit", async () => {
    const runtime = createWorldRuntime({} as WorldContext, {} as SimulationContext);
    const effects = createEffects();
    createRenderCoordinator(runtime, effects);

    await runtime.dispatch({
      type: "legacy.mutation",
      execute: () => ({ result: undefined, topics: ["simulation.clock"] })
    });

    expect(effects.renderBorders).not.toHaveBeenCalled();
    expect(effects.renderStateLabels).not.toHaveBeenCalled();
    expect(effects.renderBurgIcons).not.toHaveBeenCalled();
    expect(effects.renderBurgLabels).not.toHaveBeenCalled();
    expect(effects.renderMarkers).not.toHaveBeenCalled();
    expect(effects.renderMilitary).not.toHaveBeenCalled();
    expect(effects.scheduleWebglUpdate).not.toHaveBeenCalled();
    expect(effects.scheduleLandTopologyProjection).not.toHaveBeenCalled();
    expect(effects.schedule3dTerrainUpdate).not.toHaveBeenCalled();
    expect(effects.schedule3dSceneUpdate).not.toHaveBeenCalled();
  });

  it("coalesces multiple commits into one browser frame", async () => {
    let scheduled: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      scheduled = callback;
      return 1;
    });

    try {
      const runtime = createWorldRuntime({} as WorldContext, {} as SimulationContext);
      const effects = createEffects();
      createRenderCoordinator(runtime, effects);

      await runtime.dispatch({
        type: "legacy.mutation",
        execute: () => ({ result: undefined, topics: ["map.politics"] })
      });
      await runtime.dispatch({
        type: "legacy.mutation",
        execute: () => ({ result: undefined, topics: ["map.settlements"] })
      });

      expect(effects.renderBorders).not.toHaveBeenCalled();
      expect(effects.renderBurgIcons).not.toHaveBeenCalled();
      scheduled?.(0);
      expect(effects.renderBorders).toHaveBeenCalledOnce();
      expect(effects.renderBurgIcons).toHaveBeenCalledOnce();
    } finally {
      // Restored by afterEach; keeping the scope explicit documents that this
      // test owns the deferred scheduler.
    }
  });

  it("uses one full projection for an accepted archive replacement", async () => {
    const world = { pack: {}, grid: {}, mapId: 1, seed: "before" } as unknown as WorldContext;
    const runtime = createWorldRuntime(world, {} as SimulationContext);
    const effects = createEffects();
    createRenderCoordinator(runtime, effects);

    const { createWorldDocument } = await import("./worldArchive");
    await runtime.dispatch({
      type: "world.replace",
      payload: {
        stage: "validated",
        document: createWorldDocument(
          { pack: { cells: {}, burgs: [], states: [] }, grid: {}, mapId: 2, seed: "after" } as unknown as WorldContext,
          {} as SimulationContext,
          createPresentationData(),
          []
        )
      }
    });

    expect(effects.renderFullWorld).toHaveBeenCalledOnce();
    expect(effects.syncPresentation).toHaveBeenCalledOnce();
    expect(effects.renderBorders).not.toHaveBeenCalled();
    expect(effects.scheduleWebglUpdate).not.toHaveBeenCalled();
    expect(effects.refreshEditors).toHaveBeenCalledOnce();
  });

  it("rebuilds viewMesh scene objects after a burg position command", async () => {
    const world = {
      pack: {
        burgs: [{}, { i: 1, cell: 0, state: 1, x: 4, y: 8 }],
        states: [{ i: 0 }, { i: 1 }],
        cells: { burg: new Uint16Array([1, 0]) }
      }
    } as unknown as WorldContext;
    const runtime = createWorldRuntime(world, {} as SimulationContext);
    const effects = createEffects();
    createRenderCoordinator(runtime, effects);

    await runtime.dispatch({
      type: "burg.move",
      payload: { burgId: 1, cellId: 1, stateId: 1, x: 30, y: 40 }
    });

    expect(world.pack.burgs[1]).toMatchObject({ cell: 1, x: 30, y: 40 });
    expect(effects.renderBurgIcons).toHaveBeenCalledOnce();
    expect(effects.renderBurgLabels).toHaveBeenCalledOnce();
    expect(effects.renderBorders).toHaveBeenCalledOnce();
    expect(effects.renderStateLabels).toHaveBeenCalledOnce();
    expect(effects.schedule3dSceneUpdate).toHaveBeenCalledOnce();
  });

  it("invalidates non-DOM renderers for a presentation commit", async () => {
    const runtime = createWorldRuntime({} as WorldContext, {} as SimulationContext, createPresentationData());
    const effects = createEffects();
    createRenderCoordinator(runtime, effects);

    await runtime.dispatch({
      type: "presentation.patch",
      payload: { styles: { "#rivers": { fill: "#123456" } } }
    });

    expect(effects.scheduleWebglUpdate).toHaveBeenCalledOnce();
    expect(effects.schedule3dTerrainUpdate).toHaveBeenCalledOnce();
    expect(effects.renderBorders).not.toHaveBeenCalled();
  });

  it("coalesces topology and physical updates through the asynchronous land-topology projection path", async () => {
    const runtime = createWorldRuntime({} as WorldContext, {} as SimulationContext);
    const effects = createEffects();
    createRenderCoordinator(runtime, effects);

    await runtime.dispatch({
      type: "legacy.mutation",
      execute: () => ({ result: undefined, topics: ["map.topology", "map.physical"] })
    });

    expect(effects.scheduleLandTopologyProjection).toHaveBeenCalledOnce();
    expect(effects.scheduleWebglUpdate).toHaveBeenCalledOnce();
  });
});
