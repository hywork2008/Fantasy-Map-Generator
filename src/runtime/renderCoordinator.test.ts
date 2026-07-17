import { describe, expect, it, vi } from "vitest";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { createRenderCoordinator, type RenderEffects } from "./renderCoordinator";
import { createWorldRuntime } from "./worldRuntime";

function createEffects(): RenderEffects {
  return {
    renderBorders: vi.fn(),
    renderStateLabels: vi.fn(),
    renderBurgIcons: vi.fn(),
    renderBurgLabels: vi.fn(),
    renderMarkers: vi.fn(),
    renderMilitary: vi.fn(),
    scheduleWebglUpdate: vi.fn(),
    schedule3dTerrainUpdate: vi.fn(),
    schedule3dSceneUpdate: vi.fn(),
    refreshEditors: vi.fn(),
    refreshMilitary: vi.fn()
  };
}

describe("RenderCoordinator", () => {
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
    expect(effects.schedule3dTerrainUpdate).not.toHaveBeenCalled();
    expect(effects.schedule3dSceneUpdate).not.toHaveBeenCalled();
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
    expect(effects.schedule3dSceneUpdate).toHaveBeenCalledOnce();
  });
});
