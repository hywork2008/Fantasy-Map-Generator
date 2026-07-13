import { Deck, OrthographicView, type OrthographicViewState } from "@deck.gl/core";
import type { AppServices } from "../../context/appServices";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import { buildDeckLayers } from "./buildDeckLayers";

export interface WebglMapTextureOptions {
  /** Maximum texture dimension in physical pixels. */
  resolution: number;
  /** Text and burg icons are rendered as real 3D scene objects, not baked into the terrain. */
  includeLabels?: boolean;
  includeBurgIcons?: boolean;
}

/**
 * Produces a full-map bitmap from the same deck.gl layer/data/style pipeline as hybrid mode.
 *
 * This deliberately does not copy #webglMapCanvas: that canvas represents the current viewport,
 * while a terrain material needs the complete graph extent regardless of pan and zoom.
 */
export async function renderWebglMapTexture(
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  options: WebglMapTextureOptions
): Promise<HTMLCanvasElement | null> {
  const graphWidth = Math.max(1, worldContext.graphWidth);
  const graphHeight = Math.max(1, worldContext.graphHeight);
  const maxDimension = Math.max(256, Math.round(options.resolution));
  const aspect = graphWidth / graphHeight;
  const width = aspect >= 1 ? maxDimension : Math.max(1, Math.round(maxDimension * aspect));
  const height = aspect >= 1 ? Math.max(1, Math.round(maxDimension / aspect)) : maxDimension;
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;

  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  const resultContext = result.getContext("2d");
  if (!resultContext) return null;

  const scale = Math.min(width / graphWidth, height / graphHeight);
  const viewState: OrthographicViewState = {
    target: [graphWidth / 2, graphHeight / 2, 0],
    zoom: Math.log2(Math.max(scale, 0.0001))
  };
  const deckRef: { current: Deck<OrthographicView> | null } = { current: null };
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeout: number | null = null;
      const complete = (): void => {
        if (settled) return;
        settled = true;
        if (timeout !== null) window.clearTimeout(timeout);
        resultContext.drawImage(source, 0, 0, width, height);
        resolve();
      };
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        if (timeout !== null) window.clearTimeout(timeout);
        reject(error);
      };
      timeout = window.setTimeout(
        () => fail(new Error("Timed out while rendering the full-map WebGL texture")),
        10_000
      );

      const deck = new Deck<OrthographicView>({
        id: "fmg-webgl-map-texture",
        canvas: source,
        width,
        height,
        controller: false,
        views: new OrthographicView({ controller: false, flipY: true }),
        viewState,
        layers: buildDeckLayers(worldContext, viewContext, appServices, {
          includeLabels: options.includeLabels,
          includeBurgIcons: options.includeBurgIcons
        }),
        useDevicePixels: false,
        onAfterRender: complete,
        onError: error => fail(error instanceof Error ? error : new Error(String(error)))
      });
      deckRef.current = deck;

      // Copy only after deck.gl has actually completed a frame. Resolving on the next animation
      // frame races deck's own frame scheduling and copied an all-black canvas on some devices.
      deck.redraw("fmg-webgl-map-texture");
    });
    return result;
  } catch (error) {
    console.warn("Could not render the WebGL terrain texture", error);
    return null;
  } finally {
    deckRef.current?.finalize();
  }
}
