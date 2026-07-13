import { Deck, OrthographicView, type OrthographicViewState } from "@deck.gl/core";
import type { AppServices } from "../../context/appServices";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";
import { useLayerState } from "../../store/layerState";
import { buildLandMaskPolygons, type DeckPosition } from "./adapters/deckDataAdapters";
import { buildDeckLayers } from "./buildDeckLayers";

export interface WebglMapTextureOptions {
  /** Maximum texture dimension in physical pixels. */
  resolution: number;
  /** Text, burg icons, and routes are rendered as real 3D scene objects, not baked into the terrain. */
  includeLabels?: boolean;
  includeBurgIcons?: boolean;
  includeRoutes?: boolean;
}

interface TerrainTextureDevice {
  gl: WebGL2RenderingContext;
  source: HTMLCanvasElement;
}

// A fresh Deck layer tree is necessary for reliable full-map snapshots, but a fresh WebGL
// context is not. Every short-lived Deck attaches to this one offscreen WebGL2 context.
let terrainTextureDevice: TerrainTextureDevice | null = null;
let terrainTextureRenderQueue: Promise<void> = Promise.resolve();
const terrainTextureView = new OrthographicView({ controller: false, flipY: true });

/**
 * Produces a full-map bitmap from the same deck.gl layer/data/style pipeline as hybrid mode,
 * then composites the SVG texture overlay when it is enabled. The latter is intentionally kept
 * as SVG in hybrid mode, but must be baked here to preserve its configured opacity in viewMesh.
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
  return queueTerrainTextureRender(() => renderWebglMapTextureFrame(worldContext, viewContext, appServices, options));
}

function queueTerrainTextureRender<T>(operation: () => Promise<T>): Promise<T> {
  const queued = terrainTextureRenderQueue.then(operation, operation);
  terrainTextureRenderQueue = queued.then(
    () => undefined,
    () => undefined
  );
  return queued;
}

async function renderWebglMapTextureFrame(
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
  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  // The settled hybrid frame is probed repeatedly before accepting it as the terrain texture.
  // Prefer CPU-backed reads here to avoid Chrome's repeated getImageData readback warning.
  const resultContext = result.getContext("2d", { willReadFrequently: true });
  if (!resultContext) return null;

  const scale = Math.min(width / graphWidth, height / graphHeight);
  const viewState: OrthographicViewState = {
    target: [graphWidth / 2, graphHeight / 2, 0],
    zoom: Math.log2(Math.max(scale, 0.0001))
  };
  const deckRef: { current: Deck<OrthographicView> | null } = { current: null };
  try {
    // 09e070 removed the primary-Deck capture entirely. Its replacement offscreen Deck can keep
    // an old layer tree after a viewMesh toggle, so the terrain bitmap stops following layer
    // ON/OFF state. Reuse the already-live Deck, but render its hidden canvas with a full-map
    // view state first; copying its ordinary viewport would regress the zoomed-in viewMesh bug.
    if (await captureFullMapFromActiveDeck(resultContext, worldContext, viewContext, appServices, options)) {
      await compositeSvgTextureOverlay(resultContext, worldContext, viewContext, appServices, width, height);
      return result;
    }

    const device = getTerrainTextureDevice();
    const source = device.source;
    // Resizing clears the previous framebuffer while keeping the same WebGL2 context alive.
    source.width = width;
    source.height = height;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeout: number | null = null;
      let emptyFrameRetries = 0;
      let captureScheduled = false;
      const redrawAfterEmptyFrame = (): void => {
        emptyFrameRetries++;
        if (emptyFrameRetries > 3) {
          fail(new Error("Deck did not produce a drawable full-map texture frame"));
          return;
        }
        // Deck can call onAfterRender for its initial clear before asynchronous layers have
        // submitted their first draw. Stay with this instance and request its next frame instead
        // of treating the harmless clear frame as a terrain-render failure.
        window.requestAnimationFrame(() => {
          if (!settled) deckRef.current?.redraw("fmg-webgl-map-texture-retry");
        });
      };
      const complete = (): void => {
        if (settled) return;
        resultContext.clearRect(0, 0, width, height);
        resultContext.drawImage(source, 0, 0, width, height);
        // A redraw directly after a layer toggle can yield deck's transient clear frame. Wait
        // for the next frame rather than returning it as a black terrain texture.
        if (!hasDrawnPixels(resultContext, width, height)) {
          redrawAfterEmptyFrame();
          return;
        }
        settled = true;
        if (timeout !== null) window.clearTimeout(timeout);
        resolve();
      };
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        if (timeout !== null) window.clearTimeout(timeout);
        reject(error);
      };
      const captureSettledFrame = (): void => {
        if (settled || captureScheduled) return;
        captureScheduled = true;
        // Deck can invoke this callback for its initial clear before all layers submit. Force two
        // full redraws of this exact layer tree and copy only the frame after the second one.
        // The second redraw matters for asynchronous layer/resource initialization.
        window.requestAnimationFrame(() => {
          if (settled) return;
          deckRef.current?.setProps({
            layers: buildDeckLayers(worldContext, viewContext, appServices, {
              includeLabels: options.includeLabels,
              includeBurgIcons: options.includeBurgIcons,
              includeRoutes: options.includeRoutes
            })
          });
          deckRef.current?.redraw("fmg-webgl-map-texture-settle-1");
          window.requestAnimationFrame(() => {
            if (settled) return;
            deckRef.current?.setProps({
              layers: buildDeckLayers(worldContext, viewContext, appServices, {
                includeLabels: options.includeLabels,
                includeBurgIcons: options.includeBurgIcons,
                includeRoutes: options.includeRoutes
              })
            });
            deckRef.current?.redraw("fmg-webgl-map-texture-settle-2");
            // `redraw` queues GPU work; copying in the same animation tick can still observe
            // the preceding clear-only framebuffer on Chromium. Let the GPU finish the second
            // layer-tree redraw before reading it back.
            window.setTimeout(() => {
              if (!settled) complete();
            }, 100);
          });
        });
      };
      timeout = window.setTimeout(
        () => fail(new Error("Timed out while rendering the full-map WebGL texture")),
        10_000
      );

      deckRef.current = new Deck<OrthographicView>({
        id: "fmg-webgl-map-texture",
        canvas: source,
        gl: device.gl,
        width,
        height,
        controller: false,
        views: terrainTextureView,
        viewState,
        layers: buildDeckLayers(worldContext, viewContext, appServices, {
          includeLabels: options.includeLabels,
          includeBurgIcons: options.includeBurgIcons,
          includeRoutes: options.includeRoutes
        }),
        useDevicePixels: false,
        onAfterRender: captureSettledFrame,
        onError: error => fail(error instanceof Error ? error : new Error(String(error)))
      });
    });
    await compositeSvgTextureOverlay(resultContext, worldContext, viewContext, appServices, width, height);
    return result;
  } catch (error) {
    console.warn("Could not render the WebGL terrain texture", error);
    return null;
  } finally {
    deckRef.current?.finalize();
  }
}

async function captureFullMapFromActiveDeck(
  resultContext: CanvasRenderingContext2D,
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  options: WebglMapTextureOptions
): Promise<boolean> {
  const deck = viewContext.webglDeck;
  const canvas = viewContext.webglCanvas;
  if (!deck || !canvas) return false;

  const deckWidth = typeof deck.props.width === "number" ? deck.props.width : viewContext.svgWidth;
  const deckHeight = typeof deck.props.height === "number" ? deck.props.height : viewContext.svgHeight;
  const graphWidth = Math.max(1, worldContext.graphWidth);
  const graphHeight = Math.max(1, worldContext.graphHeight);
  const fullMapScale = Math.min(deckWidth / graphWidth, deckHeight / graphHeight);
  const originalViewState = deck.props.viewState;

  try {
    deck.setProps({
      viewState: {
        target: [graphWidth / 2, graphHeight / 2, 0],
        zoom: Math.log2(Math.max(fullMapScale, 0.0001))
      },
      layers: buildDeckLayers(worldContext, viewContext, appServices, {
        includeLabels: options.includeLabels,
        includeBurgIcons: options.includeBurgIcons,
        includeRoutes: options.includeRoutes
      })
    });
    deck.redraw("fmg-viewmesh-full-map-texture");
    await waitForAnimationFrames(3);

    resultContext.clearRect(0, 0, resultContext.canvas.width, resultContext.canvas.height);
    resultContext.drawImage(canvas, 0, 0, resultContext.canvas.width, resultContext.canvas.height);
    return hasDrawnPixels(resultContext, resultContext.canvas.width, resultContext.canvas.height);
  } finally {
    deck.setProps({
      viewState: originalViewState,
      layers: buildDeckLayers(worldContext, viewContext, appServices, {
        includeLabels: options.includeLabels,
        includeBurgIcons: options.includeBurgIcons,
        includeRoutes: options.includeRoutes
      })
    });
    deck.redraw("fmg-viewmesh-full-map-restore");
  }
}

function waitForAnimationFrames(count: number): Promise<void> {
  return new Promise(resolve => {
    const next = (remaining: number): void => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => next(remaining - 1));
    };
    next(count);
  });
}

function getTerrainTextureDevice(): TerrainTextureDevice {
  if (terrainTextureDevice) return terrainTextureDevice;

  const source = document.createElement("canvas");
  const gl = source.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 is unavailable for the terrain texture renderer");
  terrainTextureDevice = {
    source,
    gl
  };
  return terrainTextureDevice;
}

function hasDrawnPixels(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const columns = Math.min(width, 12);
  const rows = Math.min(height, 8);
  for (let row = 0; row < rows; row++) {
    const y = Math.round((row / Math.max(1, rows - 1)) * (height - 1));
    for (let column = 0; column < columns; column++) {
      const x = Math.round((column / Math.max(1, columns - 1)) * (width - 1));
      const pixel = context.getImageData(x, y, 1, 1).data;
      if ((pixel[0] ?? 0) !== 0 || (pixel[1] ?? 0) !== 0 || (pixel[2] ?? 0) !== 0 || (pixel[3] ?? 0) !== 0) {
        return true;
      }
    }
  }
  return false;
}

async function compositeSvgTextureOverlay(
  context: CanvasRenderingContext2D,
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  width: number,
  height: number
): Promise<void> {
  if (!useLayerState.getState().activeLayers.toggleTexture) return;

  const texture = viewContext.texture;
  const href = texture?.attr("data-href");
  if (!href) return;

  const image = await loadImage(href);
  if (!image) return;

  const graphWidth = Math.max(1, worldContext.graphWidth);
  const graphHeight = Math.max(1, worldContext.graphHeight);
  const opacity = getOpacity(texture?.attr("opacity") ?? texture?.style("opacity"));
  if (opacity <= 0) return;

  const x = Number(texture?.attr("data-x") ?? 0);
  const y = Number(texture?.attr("data-y") ?? 0);
  const destinationX = (Number.isFinite(x) ? x : 0) * (width / graphWidth);
  const destinationY = (Number.isFinite(y) ? y : 0) * (height / graphHeight);
  const destinationWidth = Math.max(1, width - destinationX);
  const destinationHeight = Math.max(1, height - destinationY);

  context.save();
  if (texture?.attr("mask") === "url(#land)") {
    clipToLandMask(
      context,
      buildLandMaskPolygons(worldContext, viewContext.focusScope, appServices),
      width,
      height,
      graphWidth,
      graphHeight
    );
  }
  context.globalAlpha = opacity;
  drawImageCover(context, image, destinationX, destinationY, destinationWidth, destinationHeight);
  context.restore();
}

function getOpacity(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 1;
}

function clipToLandMask(
  context: CanvasRenderingContext2D,
  masks: ReadonlyArray<{ polygon: ReadonlyArray<ReadonlyArray<DeckPosition>> }>,
  width: number,
  height: number,
  graphWidth: number,
  graphHeight: number
): void {
  const scaleX = width / Math.max(1, graphWidth);
  const scaleY = height / Math.max(1, graphHeight);
  context.beginPath();
  for (const mask of masks) {
    for (const ring of mask.polygon) {
      const [first] = ring;
      if (!first) continue;
      context.moveTo(first[0] * scaleX, first[1] * scaleY);
      for (let index = 1; index < ring.length; index++) {
        const point = ring[index];
        context.lineTo(point[0] * scaleX, point[1] * scaleY);
      }
      context.closePath();
    }
  }
  context.clip("evenodd");
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const sourceWidth = Math.max(1, image.naturalWidth);
  const sourceHeight = Math.max(1, image.naturalHeight);
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  context.drawImage(
    image,
    (sourceWidth - cropWidth) / 2,
    (sourceHeight - cropHeight) / 2,
    cropWidth,
    cropHeight,
    x,
    y,
    width,
    height
  );
}

function loadImage(href: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const image = new Image();
    let settled = false;
    const settle = (value: HTMLImageElement | null): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(value);
    };
    const timeout = window.setTimeout(() => settle(null), 2_000);
    image.onload = () => settle(image);
    image.onerror = () => settle(null);
    image.src = href;
  });
}
