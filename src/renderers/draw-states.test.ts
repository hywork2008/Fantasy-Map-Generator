import { describe, expect, it, vi } from "vitest";
import type { AppServices } from "../context/appServices";
import type { FocusFields, PoliticalLayers, RootLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { StatesRenderer } from "./draw-states";

describe("StatesRenderer", () => {
  it("clears the layer when a new-map generation has cleared the pack", () => {
    const statesBodyHtml = vi.fn();
    const statePathsHtml = vi.fn();
    const statesHaloHtml = vi.fn();
    const viewContext = {
      focusScope: null,
      statesBody: { html: statesBodyHtml },
      defs: { select: vi.fn(() => ({ html: statePathsHtml })) },
      statesHalo: { html: statesHaloHtml }
    } as unknown as RootLayers & PoliticalLayers & FocusFields;
    const worldContext = { pack: {} } as unknown as WorldContext;

    expect(() => StatesRenderer.render(worldContext, viewContext, {} as AppServices)).not.toThrow();
    expect(statesBodyHtml).toHaveBeenCalledWith("");
    expect(statePathsHtml).toHaveBeenCalledWith("");
    expect(statesHaloHtml).toHaveBeenCalledWith("");
  });
});
