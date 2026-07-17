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
    renderMilitary: vi.fn(),
    scheduleWebglUpdate: vi.fn()
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
    expect(effects.renderMilitary).not.toHaveBeenCalled();
    expect(effects.scheduleWebglUpdate).not.toHaveBeenCalled();
  });
});
