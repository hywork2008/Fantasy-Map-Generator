import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../../context/appServices";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";

const buildDeckLayersMock = vi.fn(() => []);
vi.mock("./buildDeckLayers", () => ({
  buildDeckLayers: (...args: unknown[]) => buildDeckLayersMock(...args)
}));

const { DeckGlRenderer } = await import("./deckRenderer");

const worldContext = {} as WorldContext;
const appServices = {} as AppServices;

function makeViewContext(setProps: (props: unknown) => void): ViewContext {
  return {
    renderMode: "webglHybrid",
    svg: { node: () => null },
    webglCanvas: document.createElement("canvas"),
    webglDeck: { setProps } as unknown as ViewContext["webglDeck"],
    svgWidth: 800,
    svgHeight: 600,
    scale: 1,
    viewX: 0,
    viewY: 0
  } as unknown as ViewContext;
}

describe("DeckGlRenderer", () => {
  beforeEach(() => {
    buildDeckLayersMock.mockClear();
  });

  it("render() rebuilds deck.gl layers via buildDeckLayers()", () => {
    const setProps = vi.fn();
    const viewContext = makeViewContext(setProps);

    DeckGlRenderer.render(worldContext, viewContext, appServices);

    expect(buildDeckLayersMock).toHaveBeenCalledTimes(1);
    expect(setProps).toHaveBeenCalledWith(
      expect.objectContaining({ width: 800, height: 600, layers: expect.anything() })
    );
  });

  it("syncViewState() never touches buildDeckLayers() — zoom/pan only updates viewState", () => {
    const setProps = vi.fn();
    const viewContext = makeViewContext(setProps);

    DeckGlRenderer.syncViewState(viewContext);

    expect(buildDeckLayersMock).not.toHaveBeenCalled();
    expect(setProps).toHaveBeenCalledTimes(1);
    const props = setProps.mock.calls[0][0] as Record<string, unknown>;
    expect(props).toEqual({ width: 800, height: 600, viewState: expect.anything() });
    expect(props).not.toHaveProperty("layers");
  });
});
