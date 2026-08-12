import type { Page } from "@playwright/test";
import path from "path";

/** Explicit renderer mode for map-related E2E. Never rely on browser/default. */
export type FmgRenderMode = "svg" | "webglHybrid";

export interface CanvasPixelStats {
  nonTransparentPixels: number;
  coloredPixels: number;
  alphaBoundingArea: number;
  alphaBoundingWidth: number;
  alphaBoundingHeight: number;
  width: number;
  height: number;
}

export interface ViewTransformState {
  scale: number;
  viewX: number;
  viewY: number;
}

export interface MapCanvasSize {
  width: number;
  height: number;
}

// ── Map lifecycle ────────────────────────────────────────────────────────────

/**
 * Wait until window.fmg is populated and map generation is complete.
 * Uses window.fmg.world.mapId (the canonical post-generation signal).
 */
export async function waitForMapGeneration(page: Page, timeout = 60000): Promise<void> {
  await page.waitForFunction(
    () =>
      (typeof window.fmg !== "undefined" && window.fmg.world.mapId !== undefined) ||
      Array.from(document.querySelectorAll("button")).some(button => button.textContent === "Generate entire map"),
    { timeout }
  );

  if (await page.getByRole("button", { name: "Generate entire map", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Generate entire map", exact: true }).click();
  }

  await page.waitForFunction(
    () => typeof window.fmg !== "undefined" && window.fmg.world.mapId !== undefined,
    { timeout }
  );
}

/**
 * Wait for map generation and for the SVG viewbox to have rendered content,
 * then pin the renderer mode via {@link setRenderMode}.
 *
 * `renderMode` is required so map-related E2E never depends on the browser default
 * or a sticky `localStorage["fmg-render-mode"]` from a previous session.
 */
export async function waitForMapLoad(page: Page, renderMode: FmgRenderMode, timeout = 60000): Promise<void> {
  await waitForMapGeneration(page, timeout);
  await page.waitForFunction(
    () => {
      const viewbox = document.getElementById("viewbox");
      return viewbox !== null && viewbox.children.length > 5;
    },
    { timeout: 10000 }
  );
  await setRenderMode(page, renderMode);
}

/**
 * Upload a saved .map file from tests/fixtures/ into the current app session.
 * Pins `renderMode` before and after load so hybrid/SVG tests stay deterministic.
 */
export async function uploadMapFixture(page: Page, filename: string, renderMode: FmgRenderMode): Promise<void> {
  await waitForMapLoad(page, renderMode);
  const previousMapId = await getMapId(page);
  await page.waitForSelector("#fileInputs #mapToLoad", { state: "attached" });

  await page.locator("#fileInputs #mapToLoad").setInputFiles(path.join(__dirname, `../../fixtures/${filename}`));

  await page.waitForFunction(
    mapIdBeforeUpload => {
      const viewbox = document.getElementById("viewbox");
      return (
        typeof window.fmg !== "undefined" &&
        window.fmg.world.mapId !== mapIdBeforeUpload &&
        viewbox !== null &&
        viewbox.children.length > 5
      );
    },
    previousMapId,
    { timeout: 60000 }
  );
  await setRenderMode(page, renderMode);
}

/**
 * Navigate to "/" and load a saved .map file from tests/fixtures/.
 * Returns after the loaded map id, SVG viewbox, and pinned renderer mode are available.
 */
export async function loadMapFile(page: Page, filename: string, renderMode: FmgRenderMode): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await uploadMapFixture(page, filename, renderMode);
}

/**
 * Load a fixture while the app is paused at its first generation review. This
 * reproduces the empty map-history state of loading a map before any generated
 * map has completed.
 */
export async function loadMapBeforeInitialGenerationCompletes(
  page: Page,
  filename: string,
  renderMode: FmgRenderMode
): Promise<void> {
  await page.context().clearCookies();
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Generate entire map", exact: true }).waitFor({ state: "visible" });
  await page.locator("#fileInputs #mapToLoad").setInputFiles(path.join(__dirname, `../../fixtures/${filename}`));
  await page.waitForFunction(
    () => typeof window.fmg !== "undefined" && window.fmg.world.mapId !== 0,
    { timeout: 60000 }
  );
  await setRenderMode(page, renderMode);
}

// ── Error collection ─────────────────────────────────────────────────────────

/**
 * Attach pageerror and console.error listeners before performing an action.
 * Returns the shared array that accumulates errors during the test.
 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  return errors;
}

/** Filter out known non-critical external resource errors. */
export function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes("fonts.googleapis.com") &&
      !e.includes("google-analytics") &&
      !e.includes("googletagmanager") &&
      !e.includes("Failed to load resource") &&
      !e.includes("Name is too short")
  );
}

// ── State reads ──────────────────────────────────────────────────────────────

/** Read the current pack from the world context. */
export async function getPack(page: Page) {
  return page.evaluate(() => window.fmg.world.pack);
}

/** Read the current mapId from the world context. */
export async function getMapId(page: Page): Promise<number> {
  return page.evaluate(() => window.fmg.world.mapId);
}

/** Read the generated map's logical canvas dimensions. */
export async function getMapCanvasSize(page: Page): Promise<MapCanvasSize> {
  return page.evaluate(() => ({ width: window.fmg.world.graphWidth, height: window.fmg.world.graphHeight }));
}

/** Read the geographical extent currently assigned to the generated map. */
export async function getMapCoordinates(page: Page): Promise<{
  latT: number;
  latN: number;
  latS: number;
  lonT: number;
  lonW: number;
  lonE: number;
}> {
  return page.evaluate(() => window.fmg.world.mapCoordinates);
}

/** Read precipitation proxy values for the current land cells in stable grid-cell order. */
export async function getLandPrecipitation(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const cells = window.fmg.world.grid.cells;
    const values: number[] = [];
    for (const cellId of cells.i) {
      if ((cells.h[cellId] ?? 0) >= 20) values.push(cells.prec[cellId] ?? 0);
    }
    return values;
  });
}

/** Wait until a World Configurator climate update has changed the land precipitation field. */
export async function waitForLandPrecipitationChange(page: Page, previous: readonly number[]): Promise<void> {
  await page.waitForFunction(
    prior => {
      const cells = window.fmg.world.grid.cells;
      let index = 0;
      for (const cellId of cells.i) {
        if ((cells.h[cellId] ?? 0) < 20) continue;
        if ((cells.prec[cellId] ?? 0) !== prior[index]) return true;
        index++;
      }
      return index !== prior.length;
    },
    previous,
    { timeout: 10000 }
  );
}

/** Read the sea-route topology currently persisted with the loaded map. */
export async function getSeaRouteGenerationMode(page: Page): Promise<"legacy" | "augmented" | undefined> {
  return page.evaluate(() => {
    const options = window.fmg.world.options as { seaRouteGenerationMode?: unknown };
    const mode = options.seaRouteGenerationMode;
    return mode === "legacy" || mode === "augmented" ? mode : undefined;
  });
}

/** Read the land-route cost model currently persisted with the loaded map. */
export async function getLandRouteGenerationMode(
  page: Page
): Promise<"legacy" | "elevationAware" | undefined> {
  return page.evaluate(() => {
    const options = window.fmg.world.options as { landRouteGenerationMode?: unknown };
    const mode = options.landRouteGenerationMode;
    return mode === "legacy" || mode === "elevationAware" ? mode : undefined;
  });
}

/** Stable cell-path representation of the generated sea-route network. */
export async function getSeaRouteNetworkSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    type TestRoute = { group?: unknown; points?: unknown };
    const routes = (window.fmg.world.pack as { routes?: unknown }).routes;
    if (!Array.isArray(routes)) return "";

    return (routes as TestRoute[])
      .filter(route => route.group === "searoutes" && Array.isArray(route.points))
      .map(route =>
        (route.points as unknown[])
          .map(point => (Array.isArray(point) && typeof point[2] === "number" ? String(point[2]) : ""))
          .join(",")
      )
      .sort()
      .join("|");
  });
}

/** Stable SVG-path representation of the currently rendered sea-route network. */
export async function getRenderedSeaRouteNetworkSignature(page: Page): Promise<string> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGPathElement>("#searoutes path"))
      .map(path => path.getAttribute("d") ?? "")
      .sort()
      .join("|")
  );
}

/**
 * Pin the live renderer mode through the public actions API.
 * Asserts the synchronous `viewContext.renderMode` assignment only — deck.gl
 * may still async-init (or fall back to SVG under WebGL context pressure), so
 * canvas readiness belongs in {@link waitForWebglCanvasPixels} / mode-specific waits.
 * Prefer this (or {@link waitForMapLoad}) over calling `window.fmg.actions.setRenderMode` inline.
 */
export async function setRenderMode(page: Page, mode: FmgRenderMode): Promise<void> {
  const applied = await page.evaluate(renderMode => {
    // Skip no-op writes so waitForMapLoad does not re-fire fmg:render-mode-changed → drawLayers
    // when the page already matches (common when default is already "svg").
    if (window.fmg.view.renderMode !== renderMode) {
      window.fmg.actions.setRenderMode(renderMode);
    }
    return window.fmg.view.renderMode;
  }, mode);
  if (applied !== mode) {
    throw new Error(`setRenderMode(${mode}) left view.renderMode=${String(applied)}`);
  }
}

/**
 * The #options panel div is always present in the DOM (OptionsContainer.tsx); only its
 * content is conditionally rendered based on Zustand's isMenuOpen. The #optionsHide toggle
 * button's glyph ("►" closed / "◄" open) is the only DOM-observable signal of that state.
 */
export async function isOptionsMenuOpen(page: Page): Promise<boolean> {
  return (await page.locator("#optionsHide").textContent())?.trim() === "◄";
}

export async function setLayerPreset(page: Page, preset: string): Promise<void> {
  await page.evaluate(layerPreset => window.fmg.actions.handleLayersPresetChange(layerPreset), preset);
}

export async function applyStylePreset(page: Page, preset: string): Promise<void> {
  if ((await page.locator("#optionsHide").textContent())?.trim() === "►") {
    await page.locator("#optionsHide").click();
  }
  await page.locator("#styleTab").click();
  await page.locator("#stylePreset").waitFor({ state: "attached", timeout: 5000 });
  await page.locator("#stylePreset").selectOption(preset);
  await page
    .locator(".alert-dialog button", { hasText: "Change" })
    .click({ timeout: 2000 })
    .catch(() => undefined);
  await page.waitForFunction(stylePreset => localStorage.getItem("presetStyle") === stylePreset, preset, {
    timeout: 10000
  });
  await setRenderMode(page, "webglHybrid");
}

export async function toggleLayer(page: Page, layerId: string): Promise<void> {
  await page.evaluate(id => window.fmg.actions.toggleLayer(id), layerId);
}

export async function ensureLayerOn(page: Page, layerId: string): Promise<void> {
  await page.evaluate(id => {
    if (!window.fmg.actions.layerIsOn(id)) window.fmg.actions.toggleLayer(id);
  }, layerId);
}

export async function ensureLayerOff(page: Page, layerId: string): Promise<void> {
  await page.evaluate(id => {
    if (window.fmg.actions.layerIsOn(id)) window.fmg.actions.toggleLayer(id);
  }, layerId);
}

/** Read a layer toggle state through the public test API. */
export async function isLayerOn(page: Page, layerId: string): Promise<boolean> {
  return page.evaluate(id => window.fmg.actions.layerIsOn(id), layerId);
}

export async function getWebglDeckLayerIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const deck = window.fmg.view.webglDeck as unknown as { props?: { layers?: Array<{ id?: string }> } } | null;
    return deck?.props?.layers?.map(layer => layer.id).filter((id): id is string => typeof id === "string") ?? [];
  });
}

/** Pixel signature of the ocean-depth source canvas, used to detect stale map-load geometry. */
export async function getOceanLayerCanvasChecksum(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector("#oceanLayers canvas");
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) return 0;
    const context = canvas.getContext("2d");
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let checksum = 0;
    for (let index = 0; index < pixels.length; index += 97) checksum = (checksum * 31 + pixels[index]) >>> 0;
    return checksum;
  });
}

export interface WebglLayerStyleSample {
  layerId: string;
  dataCount: number;
  group: string | null;
  fillColor: number[] | null;
  color: number[] | null;
  width: number | null;
  size: number | null;
}

export interface WebglLayerRenderingProps {
  layerId: string;
  exists: boolean;
  widthUnits: string | null;
  lineWidthUnits: string | null;
  sizeUnits: string | null;
  widthMinPixels: number | null;
  widthMaxPixels: number | null;
  lineWidthMinPixels: number | null;
  lineWidthMaxPixels: number | null;
  dataCount: number;
}

export async function getWebglLayerRenderingProps(
  page: Page,
  layerIds: readonly string[]
): Promise<WebglLayerRenderingProps[]> {
  return page.evaluate(ids => {
    function stringValue(value: unknown): string | null {
      return typeof value === "string" ? value : null;
    }

    function numberValue(value: unknown): number | null {
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }

    const deck = window.fmg.view.webglDeck as unknown as {
      props?: { layers?: Array<{ id?: string; props?: Record<string, unknown> }> };
    } | null;
    const layers = deck?.props?.layers ?? [];
    return ids.map(layerId => {
      const layer = layers.find(candidate => candidate.id === layerId);
      const props = layer?.props ?? {};
      const data = props.data;
      return {
        layerId,
        exists: Boolean(layer),
        widthUnits: stringValue(props.widthUnits),
        lineWidthUnits: stringValue(props.lineWidthUnits),
        sizeUnits: stringValue(props.sizeUnits),
        widthMinPixels: numberValue(props.widthMinPixels),
        widthMaxPixels: numberValue(props.widthMaxPixels),
        lineWidthMinPixels: numberValue(props.lineWidthMinPixels),
        lineWidthMaxPixels: numberValue(props.lineWidthMaxPixels),
        dataCount: Array.isArray(data) ? data.length : 0
      };
    });
  }, layerIds);
}

export async function getWebglLayerStyleSamples(
  page: Page,
  layerIds: readonly string[]
): Promise<WebglLayerStyleSample[]> {
  return page.evaluate(ids => {
    function isRecord(value: unknown): value is Record<string, unknown> {
      return value !== null && typeof value === "object";
    }

    function numberArray(value: unknown): number[] | null {
      return Array.isArray(value) && value.every(item => typeof item === "number") ? value : null;
    }

    function numberValue(value: unknown): number | null {
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }

    const deck = window.fmg.view.webglDeck as unknown as {
      props?: { layers?: Array<{ id?: string; props?: { data?: unknown[] } }> };
    } | null;
    const layers = deck?.props?.layers ?? [];

    return ids.map(layerId => {
      const layer = layers.find(candidate => candidate.id === layerId);
      const data = Array.isArray(layer?.props?.data) ? layer.props.data : [];
      const first = data.find(isRecord);
      return {
        layerId,
        dataCount: data.length,
        group: first && typeof first.group === "string" ? first.group : null,
        fillColor: first ? numberArray(first.fillColor) : null,
        color: first ? numberArray(first.color) : null,
        width: first ? numberValue(first.width) : null,
        size: first ? numberValue(first.size) : null
      };
    });
  }, layerIds);
}

export interface WebglDiplomacyStateLayerState {
  selectedStateId: number | null;
  colorsByStateId: Record<number, number[]>;
}

/** Reads the temporary Diplomacy Editor colouring currently rendered by the WebGL states layer. */
export async function getWebglDiplomacyStateLayerState(page: Page): Promise<WebglDiplomacyStateLayerState> {
  return page.evaluate(() => {
    type StatePolygonDatum = { cellId?: unknown; fillColor?: unknown };
    type TestFmg = {
      view: { webglDeck: unknown; diplomacySelectedStateId: unknown };
      world: { pack: { cells: { state: ArrayLike<number> } } };
    };
    const fmg = window.fmg as unknown as TestFmg;
    const deck = window.fmg.view.webglDeck as unknown as {
      props?: { layers?: Array<{ id?: string; props?: { data?: unknown } }> };
    } | null;
    const stateLayer = deck?.props?.layers?.find(layer => layer.id === "fmg-webgl-states");
    const data = Array.isArray(stateLayer?.props?.data) ? stateLayer.props.data : [];
    const colorsByStateId: Record<number, number[]> = {};

    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const datum = item as StatePolygonDatum;
      if (typeof datum.cellId !== "number" || !Array.isArray(datum.fillColor)) continue;
      if (!datum.fillColor.every(value => typeof value === "number")) continue;
      const stateId = fmg.world.pack.cells.state[datum.cellId];
      if (stateId) colorsByStateId[stateId] = datum.fillColor;
    }

    const selectedStateId = fmg.view.diplomacySelectedStateId;
    return { selectedStateId: typeof selectedStateId === "number" ? selectedStateId : null, colorsByStateId };
  });
}

export interface WebglEmblemIconSummary {
  total: number;
  withIconUrl: number;
  burgWithIconUrl: number;
  stateOrProvinceWithIconUrl: number;
}

/** Reads the fmg-webgl-emblems deck layer data to check coa icon rasterization progress (Phase 6). */
export async function getWebglEmblemIconSummary(page: Page): Promise<WebglEmblemIconSummary> {
  return page.evaluate(() => {
    const deck = window.fmg.view.webglDeck as unknown as {
      props?: { layers?: Array<{ id?: string; props?: { data?: unknown[] } }> };
    } | null;
    const layers = deck?.props?.layers ?? [];
    const layer = layers.find(candidate => candidate.id === "fmg-webgl-emblems");
    const data = Array.isArray(layer?.props?.data)
      ? (layer!.props!.data as Array<{ type?: string; iconUrl?: string | null }>)
      : [];
    const withIconUrl = data.filter(datum => Boolean(datum.iconUrl));
    return {
      total: data.length,
      withIconUrl: withIconUrl.length,
      burgWithIconUrl: withIconUrl.filter(datum => datum.type === "burg").length,
      stateOrProvinceWithIconUrl: withIconUrl.filter(datum => datum.type === "state" || datum.type === "province")
        .length
    };
  });
}

export interface WebglBurgIconSummary {
  total: number;
  withIconUrl: number;
  distinctIconUrls: number;
  maskedCount: number;
  unmaskedCount: number;
}

/** Reads the fmg-webgl-burg-icons deck layer data to check data-icon rasterization (Phase 6.2). */
export async function getWebglBurgIconSummary(page: Page): Promise<WebglBurgIconSummary> {
  return page.evaluate(() => {
    const deck = window.fmg.view.webglDeck as unknown as {
      props?: { layers?: Array<{ id?: string; props?: { data?: unknown[] } }> };
    } | null;
    const layers = deck?.props?.layers ?? [];
    const layer = layers.find(candidate => candidate.id === "fmg-webgl-burg-icons");
    const data = Array.isArray(layer?.props?.data)
      ? (layer!.props!.data as Array<{ iconUrl?: string | null; mask?: boolean }>)
      : [];
    const withIconUrl = data.filter(datum => Boolean(datum.iconUrl));
    return {
      total: data.length,
      withIconUrl: withIconUrl.length,
      distinctIconUrls: new Set(withIconUrl.map(datum => datum.iconUrl)).size,
      maskedCount: withIconUrl.filter(datum => datum.mask).length,
      unmaskedCount: withIconUrl.filter(datum => !datum.mask).length
    };
  });
}

export interface WebglMarkerIconState {
  icon: string;
  isExternalIcon: boolean;
}

/** Reads a single marker's icon state from the fmg-webgl-markers deck layer data (Phase 6.2). */
export async function getWebglMarkerIconState(page: Page, markerId: number): Promise<WebglMarkerIconState | null> {
  return page.evaluate(id => {
    const deck = window.fmg.view.webglDeck as unknown as {
      props?: { layers?: Array<{ id?: string; props?: { data?: unknown[] } }> };
    } | null;
    const layers = deck?.props?.layers ?? [];
    const layer = layers.find(candidate => candidate.id === "fmg-webgl-markers");
    const data = Array.isArray(layer?.props?.data)
      ? (layer!.props!.data as Array<{ id?: string; icon?: string; isExternalIcon?: boolean }>)
      : [];
    const datum = data.find(item => item.id === `marker-${id}`);
    if (!datum) return null;
    return { icon: datum.icon ?? "", isExternalIcon: Boolean(datum.isExternalIcon) };
  }, markerId);
}

export interface WebglLabelLayerSettings {
  exists: boolean;
  fontFamily: string | null;
  sdf: boolean | null;
  outlineWidth: number | null;
  outlineColor: number[] | null;
  total: number;
  stateCount: number;
  nonZeroAngleStateCount: number;
  angles: Record<string, number>;
}

/** Reads the fmg-webgl-labels TextLayer's static props and per-datum angles (Phase 6.3). */
export async function getWebglLabelLayerSettings(page: Page): Promise<WebglLabelLayerSettings> {
  return page.evaluate(() => {
    const deck = window.fmg.view.webglDeck as unknown as {
      props?: { layers?: Array<{ id?: string; props?: Record<string, unknown> }> };
    } | null;
    const layers = deck?.props?.layers ?? [];
    const layer = layers.find(candidate => candidate.id === "fmg-webgl-labels");
    const props = layer?.props ?? {};
    const data = Array.isArray(props.data)
      ? (props.data as Array<{ id?: string; type?: string; angle?: number }>)
      : [];
    const stateLabels = data.filter(datum => datum.type === "state");
    const fontSettings = props.fontSettings as { sdf?: boolean } | undefined;
    return {
      exists: Boolean(layer),
      fontFamily: typeof props.fontFamily === "string" ? props.fontFamily : null,
      sdf: typeof fontSettings?.sdf === "boolean" ? fontSettings.sdf : null,
      outlineWidth: typeof props.outlineWidth === "number" ? props.outlineWidth : null,
      outlineColor: Array.isArray(props.outlineColor) ? (props.outlineColor as number[]) : null,
      total: data.length,
      stateCount: stateLabels.length,
      nonZeroAngleStateCount: stateLabels.filter(datum => Number.isFinite(datum.angle) && datum.angle !== 0).length,
      angles: Object.fromEntries(stateLabels.map(datum => [datum.id ?? "", datum.angle ?? 0]))
    };
  });
}

export interface WebglStyleComparison {
  source: string;
  group: string;
  svgColor: number[];
  deckColor: number[];
  svgWidth: number | null;
  deckWidth: number | null;
  svgSize: number | null;
  deckSize: number | null;
}

export async function getWebglStyleComparisons(page: Page): Promise<WebglStyleComparison[]> {
  return page.evaluate(() => {
    function isRecord(value: unknown): value is Record<string, unknown> {
      return value !== null && typeof value === "object";
    }

    function numberArray(value: unknown): number[] | null {
      return Array.isArray(value) && value.every(item => typeof item === "number") ? value : null;
    }

    function numberValue(value: unknown): number | null {
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }

    function attrOrStyle(element: Element | null, name: string): string | null {
      if (!element) return null;
      const attr = element.getAttribute(name);
      if (attr) return attr;
      const style = window.getComputedStyle(element).getPropertyValue(name);
      return style || null;
    }

    function optionalNumber(value: string | null): number | null {
      if (!value || value === "none" || value === "null") return null;
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function resolveCssColor(value: string | null, fallback: string, opacity: number): number[] {
      const probe = document.createElement("span");
      probe.style.color = value || fallback;
      if (!probe.style.color) probe.style.color = fallback;
      document.body.append(probe);
      const computed = window.getComputedStyle(probe).color;
      probe.remove();
      const match = computed.match(/rgba?\(([^)]+)\)/);
      if (!match) return [153, 153, 153, Math.round(255 * opacity)];
      const parts = match[1].split(",").map(part => part.trim());
      const red = Number.parseFloat(parts[0] ?? "153");
      const green = Number.parseFloat(parts[1] ?? "153");
      const blue = Number.parseFloat(parts[2] ?? "153");
      const alpha = parts[3] === undefined ? 1 : Number.parseFloat(parts[3]);
      return [red, green, blue, Math.round(255 * alpha * opacity)];
    }

    function readPaint(
      rootId: "lakes" | "coastline",
      group: string,
      fillFallback: string,
      strokeFallback: string,
      strokeWidthFallback: number,
      opacityFallback: number
    ): { fill: number[]; stroke: number[]; strokeWidth: number } {
      const element = document.querySelector(`#${rootId} #${CSS.escape(group)}`);
      const opacity = optionalNumber(attrOrStyle(element, "opacity")) ?? opacityFallback;
      return {
        fill: resolveCssColor(attrOrStyle(element, "fill"), fillFallback, opacity),
        stroke: resolveCssColor(attrOrStyle(element, "stroke"), strokeFallback, opacity),
        strokeWidth: optionalNumber(attrOrStyle(element, "stroke-width")) ?? strokeWidthFallback
      };
    }

    function readLabel(group: string): { color: number[]; size: number } {
      const selector = group === "states" ? "#labels #states" : `#burgLabels #${CSS.escape(group)}`;
      const element = document.querySelector(selector);
      const opacity = optionalNumber(attrOrStyle(element, "opacity")) ?? 1;
      const size =
        optionalNumber(attrOrStyle(element, "data-size")) ??
        optionalNumber(attrOrStyle(element, "font-size")) ??
        (group === "states" ? 22 : 4);
      return {
        color: resolveCssColor(attrOrStyle(element, "fill"), "#3e3e4b", opacity),
        size
      };
    }

    function getLayerData(layerId: string): Record<string, unknown>[] {
      const deck = window.fmg.view.webglDeck as unknown as {
        props?: { layers?: Array<{ id?: string; props?: { data?: unknown[] } }> };
      } | null;
      const layer = deck?.props?.layers?.find(candidate => candidate.id === layerId);
      return (Array.isArray(layer?.props?.data) ? layer.props.data : []).filter(isRecord);
    }

    function uniqueByGroup(data: Record<string, unknown>[]): Record<string, Record<string, unknown>> {
      const byGroup: Record<string, Record<string, unknown>> = {};
      for (const item of data) {
        const group = typeof item.group === "string" ? item.group : "";
        if (group && !byGroup[group]) byGroup[group] = item;
      }
      return byGroup;
    }

    const comparisons: WebglStyleComparison[] = [];
    const lakeFillFallbacks: Record<string, [string, string, number, number]> = {
      freshwater: ["#a6c1fd", "#5f799d", 0.7, 0.5],
      salt: ["#409b8a", "#388985", 0.7, 0.5],
      sinkhole: ["#5bc9fd", "#53a3b0", 0.7, 1],
      frozen: ["#cdd4e7", "#cfe0eb", 0, 0.95],
      lava: ["#90270d", "#f93e0c", 2, 0.7],
      dry: ["#c9bfa7", "#8e816f", 0.7, 1]
    };

    for (const [group, item] of Object.entries(uniqueByGroup(getLayerData("fmg-webgl-lakes")))) {
      const fallback = lakeFillFallbacks[group] ?? lakeFillFallbacks.freshwater;
      const paint = readPaint("lakes", group, fallback[0], fallback[1], fallback[2], fallback[3]);
      const deckColor = numberArray(item.fillColor);
      if (deckColor) {
        comparisons.push({
          source: "lake-fill",
          group,
          svgColor: paint.fill,
          deckColor,
          svgWidth: null,
          deckWidth: null,
          svgSize: null,
          deckSize: null
        });
      }
    }

    for (const [group, item] of Object.entries(uniqueByGroup(getLayerData("fmg-webgl-lakes-outlines")))) {
      const fallback = lakeFillFallbacks[group] ?? lakeFillFallbacks.freshwater;
      const paint = readPaint("lakes", group, fallback[0], fallback[1], fallback[2], fallback[3]);
      const deckColor = numberArray(item.color);
      const deckWidth = numberValue(item.width);
      if (deckColor && deckWidth !== null) {
        comparisons.push({
          source: "lake-outline",
          group,
          svgColor: paint.stroke,
          deckColor,
          svgWidth: paint.strokeWidth,
          deckWidth,
          svgSize: null,
          deckSize: null
        });
      }
    }

    const coastlineFallbacks: Record<string, [string, string, number, number]> = {
      sea_island: ["transparent", "#1f3846", 0.5, 0.5],
      lake_island: ["transparent", "#7c8eaf", 0.35, 1]
    };
    for (const [group, item] of Object.entries(uniqueByGroup(getLayerData("fmg-webgl-coastline")))) {
      const fallback = coastlineFallbacks[group] ?? coastlineFallbacks.sea_island;
      const paint = readPaint("coastline", group, fallback[0], fallback[1], fallback[2], fallback[3]);
      const deckColor = numberArray(item.color);
      const deckWidth = numberValue(item.width);
      if (deckColor && deckWidth !== null) {
        comparisons.push({
          source: "coastline",
          group,
          svgColor: paint.stroke,
          deckColor,
          svgWidth: paint.strokeWidth,
          deckWidth,
          svgSize: null,
          deckSize: null
        });
      }
    }

    for (const [group, item] of Object.entries(uniqueByGroup(getLayerData("fmg-webgl-labels")))) {
      const label = readLabel(group);
      const deckColor = numberArray(item.color);
      const deckSize = numberValue(item.size);
      if (deckColor && deckSize !== null) {
        comparisons.push({
          source: "label",
          group,
          svgColor: label.color,
          deckColor,
          svgWidth: null,
          deckWidth: null,
          svgSize: label.size,
          deckSize
        });
      }
    }

    return comparisons;
  });
}

export interface WebglLayerPolicyEntry {
  id: string;
  exists: boolean;
  display: string;
  hasManagedClass: boolean;
  hasOverlayClass: boolean;
  childCount: number;
}

export async function getWebglLayerPolicyState(
  page: Page,
  layerIds: readonly string[]
): Promise<WebglLayerPolicyEntry[]> {
  return page.evaluate(
    ids =>
      ids.map(id => {
        const element = document.getElementById(id);
        return {
          id,
          exists: Boolean(element),
          display: element ? window.getComputedStyle(element).display : "",
          hasManagedClass: Boolean(element?.classList.contains("fmg-webgl-managed-svg-layer")),
          hasOverlayClass: Boolean(element?.classList.contains("fmg-webgl-svg-overlay-layer")),
          childCount: element?.children.length ?? 0
        };
      }),
    layerIds
  );
}

export interface WebglRendererDomState {
  bodyHasHybridClass: boolean;
  canvasDisplay: string;
  deckExists: boolean;
  landmassHasManagedClass: boolean;
  landmassDisplay: string;
  scaleBarHasOverlayClass: boolean;
  scaleBarDisplay: string;
  deckHasTestMarker: boolean;
  deckLayersSuspended: boolean;
  deckCanvasMatchesDom: boolean;
  viewCanvasMatchesDom: boolean;
}

export async function markCurrentWebglDeck(page: Page): Promise<void> {
  await page.evaluate(() => {
    const deck = window.fmg.view.webglDeck as unknown as { __testMarker?: string } | null;
    if (deck) deck.__testMarker = "before-map-load";
  });
}

export async function getWebglRendererDomState(page: Page): Promise<WebglRendererDomState> {
  return page.evaluate(() => {
    const canvas = document.getElementById("webglMapCanvas");
    const landmass = document.getElementById("landmass");
    const scaleBar = document.getElementById("scaleBar");
    const deck = window.fmg.view.webglDeck as unknown as {
      __testMarker?: string;
      canvas?: HTMLCanvasElement;
      props?: { layers?: unknown[] };
    } | null;

    return {
      bodyHasHybridClass: document.body.classList.contains("fmg-webgl-hybrid"),
      canvasDisplay: canvas ? window.getComputedStyle(canvas).display : "",
      deckExists: Boolean(deck),
      landmassHasManagedClass: Boolean(landmass?.classList.contains("fmg-webgl-managed-svg-layer")),
      landmassDisplay: landmass ? window.getComputedStyle(landmass).display : "",
      scaleBarHasOverlayClass: Boolean(scaleBar?.classList.contains("fmg-webgl-svg-overlay-layer")),
      scaleBarDisplay: scaleBar ? window.getComputedStyle(scaleBar).display : "",
      deckHasTestMarker: deck?.__testMarker === "before-map-load",
      deckLayersSuspended: Boolean(deck && Array.isArray(deck.props?.layers) && deck.props.layers.length === 0),
      deckCanvasMatchesDom: Boolean(deck && canvas instanceof HTMLCanvasElement && deck.canvas === canvas),
      viewCanvasMatchesDom: Boolean(canvas instanceof HTMLCanvasElement && window.fmg.view.webglCanvas === canvas)
    };
  });
}

export async function getFirstLandScreenPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const { pack } = window.fmg.world;
    const cellId = Array.from(pack.cells.i).find(cell => pack.cells.h[cell] >= 20) ?? 0;
    const [mapX, mapY] = pack.cells.p[cellId];
    return {
      x: mapX * window.fmg.view.scale + window.fmg.view.viewX,
      y: mapY * window.fmg.view.scale + window.fmg.view.viewY
    };
  });
}

export interface StateHoverPoint {
  x: number;
  y: number;
  stateName: string;
}

/**
 * Finds a screen point guaranteed to land inside a rendered state polygon, for tooltip-parity
 * checks between SVG and WebGL hover. Takes a pack cell's Voronoi centroid (always inside that
 * cell's slice of its state's merged polygon, unlike a path bounding-box center, which a
 * concave/multi-part state shape or an overlapping state-label `<tspan>` can miss) and converts it
 * to client coordinates via the `#statesBody` path's actual `getScreenCTM()`, so it is correct
 * regardless of the current pan/zoom transform. Requires `toggleStates` to already be on.
 */
export async function getFirstStateScreenPoint(page: Page): Promise<StateHoverPoint | null> {
  return page.evaluate(() => {
    type TestState = { i: number; center: number; removed?: boolean; fullName?: string; name?: string };
    type TestRoute = { cells?: number[] };
    type TestBurg = { i?: number; removed?: boolean; x: number; y: number };
    type TestPack = {
      cells: { i: number[]; h: number[]; state: number[]; r: number[]; burg: number[]; p: [number, number][] };
      states: TestState[];
      routes: TestRoute[];
      burgs: TestBurg[];
    };

    const statesBody = document.getElementById("statesBody");
    if (!statesBody) return null;

    const pack = window.fmg.world.pack as unknown as TestPack;
    // `state.center` (the cell the state was seeded/grown from, also used for label placement) is
    // reliably inside the rendered polygon, unlike an arbitrary cell whose stale `cells.state`
    // metadata doesn't always match the current polygon (e.g. post-war border reassignment). But
    // capitals/centers also tend to have roads/burgs on or near them, and a WebGL single-object
    // pick (deck.gl pickObject) can prioritize an overlapping route/burg icon a few pixels wide over
    // the land polygon underneath — so prefer the land cell of this state closest to its center that
    // has no river/route on it and is not within burg-icon range of any burg.
    const routeCells = new Set<number>();
    for (const route of pack.routes) for (const cell of route.cells ?? []) routeCells.add(cell);

    const burgs = pack.burgs.filter(burg => burg.i);
    const BURG_CLEARANCE = 20;
    const nearBurg = (x: number, y: number): boolean =>
      burgs.some(burg => (burg.x - x) ** 2 + (burg.y - y) ** 2 < BURG_CLEARANCE ** 2);

    // #labels stays a real, interactive SVG overlay above the WebGL canvas in hybrid mode
    // (hybridLayerPolicy.ts's HYBRID_SVG_OVERLAY_LAYER_IDS, so the Label Editor can still edit
    // curved state-name textPaths). A raw page.mouse.click() landing on that text — or on any
    // floating .fmg-dialog panel a caller opened first (e.g. the Diplomacy Editor) — never
    // reaches deck.gl's picking layer beneath it, so a candidate point must dodge both.
    function toWorldRect(
      rect: DOMRect,
      svg: SVGSVGElement,
      inverseCtm: DOMMatrix,
      padding: number
    ): { minX: number; maxX: number; minY: number; maxY: number } {
      const corners = [
        [rect.left - padding, rect.top - padding],
        [rect.right + padding, rect.bottom + padding]
      ].map(([clientX, clientY]) => {
        const point = svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        return point.matrixTransform(inverseCtm);
      });
      const xs = corners.map(point => point.x);
      const ys = corners.map(point => point.y);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    }

    function findClickableCell(
      state: TestState,
      path: SVGPathElement,
      svg: SVGSVGElement
    ): { x: number; y: number } | null {
      const ctm = path.getScreenCTM();
      if (!ctm) return null;
      const inverseCtm = ctm.inverse();

      const obstructedRects: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];
      const labelEl = document.getElementById(`stateLabel${state.i}`);
      if (labelEl) {
        const rect = labelEl.getBoundingClientRect();
        if (rect.width || rect.height) obstructedRects.push(toWorldRect(rect, svg, inverseCtm, 8));
      }
      for (const dialog of document.querySelectorAll<HTMLElement>(".fmg-dialog")) {
        if (dialog.style.display === "none") continue;
        const rect = dialog.getBoundingClientRect();
        if (rect.width || rect.height) obstructedRects.push(toWorldRect(rect, svg, inverseCtm, 0));
      }
      const isObstructed = (x: number, y: number): boolean =>
        obstructedRects.some(rect => x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY);

      const [centerX, centerY] = pack.cells.p[state.center];
      let bestCell = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const cell of pack.cells.i) {
        if (pack.cells.state[cell] !== state.i || pack.cells.h[cell] < 20) continue;
        if (pack.cells.r[cell] || routeCells.has(cell)) continue;
        const [x, y] = pack.cells.p[cell];
        if (nearBurg(x, y) || isObstructed(x, y)) continue;
        const dist = (x - centerX) ** 2 + (y - centerY) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestCell = cell;
        }
      }
      if (bestCell === -1) return null;

      const localPoint = svg.createSVGPoint();
      localPoint.x = pack.cells.p[bestCell][0];
      localPoint.y = pack.cells.p[bestCell][1];
      const clientPoint = localPoint.matrixTransform(ctm);
      return { x: clientPoint.x, y: clientPoint.y };
    }

    // A small/burg-dense state can have every land cell excluded (river, route, burg icon, or
    // its own label) — try every state in turn rather than falling back to a known-bad point.
    for (const state of pack.states) {
      if (!state.i || state.removed) continue;
      const path = statesBody.querySelector<SVGPathElement>(`#state${state.i}`);
      const svg = path?.ownerSVGElement;
      if (!path || !svg) continue;

      const point = findClickableCell(state, path, svg);
      if (!point) continue;
      return { x: point.x, y: point.y, stateName: state.fullName ?? state.name ?? "" };
    }

    return null;
  });
}

/** Reads the current visible toast/tooltip text from the shared #toast-container (used for both SVG and WebGL hover tips). */
export async function getToastText(page: Page): Promise<string> {
  return page.locator("#toast-container").innerText().catch(() => "");
}

export interface OverlappingRegimentPoint {
  x: number;
  y: number;
  stateId: number;
  regimentIds: [number, number];
  burgId: number;
}

export async function forceOverlappingWebglRegiments(page: Page): Promise<OverlappingRegimentPoint> {
  const point = await page.evaluate(() => {
    type TestRegiment = { i: number; x: number; y: number; cell: number; angle?: number };
    type TestState = { i?: number; removed?: boolean; military?: TestRegiment[] };
    type TestBurg = { i?: number; removed?: boolean; state?: number; x: number; y: number; cell: number };

    const states = window.fmg.world.pack.states as TestState[];
    const burgs = window.fmg.world.pack.burgs as TestBurg[];
    const state = states.find(
      item =>
        item.i &&
        !item.removed &&
        (item.military?.length ?? 0) >= 2 &&
        burgs.some(burg => burg.i && !burg.removed && burg.state === item.i)
    );
    if (!state?.i || !state.military) throw new Error("No state with at least two regiments and one burg");
    const burg = burgs.find(item => item.i && !item.removed && item.state === state.i);
    if (!burg?.i) throw new Error("No burg for overlapping regiment test");

    const [first, second] = state.military;
    first.x = burg.x;
    first.y = burg.y;
    first.cell = burg.cell;
    first.angle = 0;
    second.x = burg.x;
    second.y = burg.y;
    second.cell = burg.cell;
    second.angle = first.angle ?? 0;

    return {
      x: burg.x * window.fmg.view.scale + window.fmg.view.viewX,
      y: burg.y * window.fmg.view.scale + window.fmg.view.viewY,
      stateId: state.i,
      regimentIds: [first.i, second.i] as [number, number],
      burgId: burg.i
    };
  });

  await setRenderMode(page, "webglHybrid");
  await page.waitForFunction(
    ({ stateId, regimentIds }) => {
      const deck = window.fmg.view.webglDeck as unknown as {
        props?: { layers?: Array<{ id?: string; props?: { data?: unknown[] } }> };
      } | null;
      const layer = deck?.props?.layers?.find(item => item.id === "fmg-webgl-military");
      const data = Array.isArray(layer?.props?.data) ? layer.props.data : [];
      return regimentIds.every(regimentId =>
        data.some(item => {
          const record = item as Record<string, unknown>;
          return record.id === `regiment-${stateId}-${regimentId}-main`;
        })
      );
    },
    point,
    { timeout: 5000 }
  );

  return point;
}

export interface GlacierFixturePoint {
  x: number;
  y: number;
  glacierId: number;
}

export interface IcebergFixturePoint {
  x: number;
  y: number;
  icebergId: number;
}

/** Adds a glacier at the map center so ice click-edit tests don't depend on seed-specific ice generation. */
export async function forceWebglGlacierFixture(page: Page): Promise<GlacierFixturePoint> {
  const point = await page.evaluate(() => {
    type IceGlacier = { i: number; points: [number, number][]; type: "glacier" };
    type TestPack = { ice: IceGlacier[] };

    const pack = window.fmg.world.pack as unknown as TestPack;
    const glacierId = pack.ice.reduce((max, item) => Math.max(max, item.i), 0) + 1;
    const cx = window.fmg.world.graphWidth / 2;
    const cy = window.fmg.world.graphHeight / 2;
    const size = 6;
    pack.ice.push({
      i: glacierId,
      type: "glacier",
      points: [
        [cx - size, cy - size],
        [cx + size, cy - size],
        [cx + size, cy + size],
        [cx - size, cy + size]
      ]
    });

    return {
      x: cx * window.fmg.view.scale + window.fmg.view.viewX,
      y: cy * window.fmg.view.scale + window.fmg.view.viewY,
      glacierId
    };
  });

  await setRenderMode(page, "webglHybrid");
  await page.waitForFunction(
    ({ glacierId }) => {
      const deck = window.fmg.view.webglDeck as unknown as {
        props?: { layers?: Array<{ id?: string; props?: { data?: unknown[] } }> };
      } | null;
      const layer = deck?.props?.layers?.find(item => item.id === "fmg-webgl-ice");
      const data = Array.isArray(layer?.props?.data) ? layer.props.data : [];
      return data.some(item => (item as Record<string, unknown>).id === `glacier-${glacierId}`);
    },
    point,
    { timeout: 5000 }
  );

  return point;
}

/** Adds an iceberg at the map center so ice drag tests cover both ice feature types. */
export async function forceWebglIcebergFixture(page: Page): Promise<IcebergFixturePoint> {
  const point = await page.evaluate(() => {
    type IceIceberg = {
      i: number;
      points: [number, number][];
      type: "iceberg";
      cellId: number;
      size: number;
    };
    type TestPack = { ice: IceIceberg[] };

    const pack = window.fmg.world.pack as unknown as TestPack;
    const icebergId = pack.ice.reduce((max, item) => Math.max(max, item.i), 0) + 1;
    const cx = window.fmg.world.graphWidth / 2;
    const cy = window.fmg.world.graphHeight / 2;
    const size = 6;
    pack.ice.push({
      i: icebergId,
      type: "iceberg",
      cellId: 0,
      size,
      points: [
        [cx - size, cy - size],
        [cx + size, cy - size],
        [cx + size, cy + size],
        [cx - size, cy + size]
      ]
    });

    return {
      x: cx * window.fmg.view.scale + window.fmg.view.viewX,
      y: cy * window.fmg.view.scale + window.fmg.view.viewY,
      icebergId
    };
  });

  await setRenderMode(page, "webglHybrid");
  await page.waitForFunction(
    ({ icebergId }) => {
      const deck = window.fmg.view.webglDeck as unknown as {
        props?: { layers?: Array<{ id?: string; props?: { data?: unknown[] } }> };
      } | null;
      const layer = deck?.props?.layers?.find(item => item.id === "fmg-webgl-ice");
      const data = Array.isArray(layer?.props?.data) ? layer.props.data : [];
      return data.some(item => (item as Record<string, unknown>).id === `iceberg-${icebergId}`);
    },
    point,
    { timeout: 5000 }
  );

  return point;
}

export interface MarkerFixturePoint {
  x: number;
  y: number;
  markerId: number;
}

export interface ThreeDBurgFixture {
  burgId: number;
  burgName: string;
}

/** Moves and enlarges a burg at the map center so viewMesh click tests have a deterministic target. */
export async function forceThreeDBurgFixture(page: Page): Promise<ThreeDBurgFixture> {
  return page.evaluate(() => {
    type TestBurg = { i?: number; removed?: boolean; x: number; y: number; name?: string; group?: string };
    type SvgSelection = { select<T extends SVGElement>(selector: string): { attr(name: string, value: number): void } };
    type TestFmg = {
      world: {
        pack: { burgs: TestBurg[] };
        graphWidth: number;
        graphHeight: number;
        options: { burgs?: { groups?: Array<{ name?: string }> } };
      };
      view: { burgIcons: SvgSelection };
    };

    const fmg = window.fmg as unknown as TestFmg;
    const { world } = fmg;
    const burg = world.pack.burgs.find(item => Boolean(item.i) && !item.removed);
    if (!burg || typeof burg.i !== "number") {
      throw new Error("A generated map must contain a burg for the 3D click fixture");
    }

    const groupName = world.options.burgs?.groups?.[0]?.name ?? "town";
    burg.x = world.graphWidth / 2;
    burg.y = world.graphHeight / 2;
    burg.group = groupName;
    // `buildLowPolyBurgSymbols` maps SVG icon size to the low-poly mesh size. A larger fixture
    // makes the centre-targeted Canvas click stable without changing production hit-testing.
    fmg.view.burgIcons.select<SVGGElement>(`#${groupName}`).attr("data-size", 400);

    // The `data-size` override above is a group-wide style (buildLowPolyBurgSymbols reads it
    // per `burg.group`, not per burg), so every other burg sharing `groupName` would also become
    // a giant 3D sphere and compete with the fixture for the click ray. Reassign siblings to a
    // group id that is absent from `options.burgs.groups` so they're filtered out of the 3D
    // scene entirely (`visibleGroups.has(group)` in getBurgIconStyle) and only the fixture's
    // icon remains clickable.
    for (const other of world.pack.burgs) {
      if (other.i && !other.removed && other.i !== burg.i && other.group === groupName) {
        other.group = "__e2e-3d-fixture-hidden__";
      }
    }

    return { burgId: burg.i, burgName: burg.name ?? "" };
  });
}

/**
 * Clicks a grid of points on `#canvas3d` (dispatching real pointerdown/pointerup, the same
 * events ThreeDRenderer.attachBurgPicking listens for) until `fmg:3d-burg-select` reports
 * `expectedBurgId`, or every point has been tried. The screen position of a low-poly burg icon
 * depends on the current camera/terrain framing (angle, mesh elevation under the icon, viewport
 * size), which is impractical to precompute or hardcode reliably from a test — a grid search is
 * the stable alternative. Returns whether the burg was found.
 */
export async function clickLowPolyBurgIconUntilSelected(page: Page, expectedBurgId: number): Promise<boolean> {
  const bounds = await page.locator("#canvas3d").boundingBox();
  if (!bounds) return false;

  return page.evaluate(
    ({ bounds, expectedBurgId }) => {
      return new Promise<boolean>(resolve => {
        const canvasEl = document.getElementById("canvas3d");
        if (!(canvasEl instanceof HTMLCanvasElement)) {
          resolve(false);
          return;
        }

        const steps = 12;
        const points: Array<{ x: number; y: number }> = [];
        for (let gx = 1; gx < steps; gx++) {
          for (let gy = 1; gy < steps; gy++) {
            points.push({
              x: bounds.x + (bounds.width * gx) / steps,
              y: bounds.y + (bounds.height * gy) / steps
            });
          }
        }

        let index = 0;
        let settled = false;
        const finish = (result: boolean) => {
          if (settled) return;
          settled = true;
          document.removeEventListener("fmg:3d-burg-select", onSelect);
          resolve(result);
        };
        const onSelect = (event: Event) => {
          const detail = (event as CustomEvent<{ burgId: number }>).detail;
          if (detail?.burgId === expectedBurgId) finish(true);
        };
        document.addEventListener("fmg:3d-burg-select", onSelect);

        const tryNext = (): void => {
          if (settled) return;
          if (index >= points.length) {
            finish(false);
            return;
          }
          const point = points[index++];
          canvasEl.dispatchEvent(
            new PointerEvent("pointerdown", { clientX: point.x, clientY: point.y, button: 0, bubbles: true })
          );
          canvasEl.dispatchEvent(
            new PointerEvent("pointerup", { clientX: point.x, clientY: point.y, button: 0, bubbles: true })
          );
          setTimeout(tryNext, 10);
        };
        tryNext();
      });
    },
    { bounds, expectedBurgId }
  );
}

/** Adds a marker at the map center so marker click-edit/drag tests don't depend on seed-specific marker generation. */
export async function forceWebglMarkerFixture(page: Page): Promise<MarkerFixturePoint> {
  const point = await page.evaluate(() => {
    type TestMarker = { i: number; type: string; icon: string; cell: number; x: number; y: number; size: number };
    type TestPack = { markers: TestMarker[] };

    const pack = window.fmg.world.pack as unknown as TestPack;
    const markerId = pack.markers.reduce((max, item) => Math.max(max, item.i), 0) + 1;
    const cx = window.fmg.world.graphWidth / 2;
    const cy = window.fmg.world.graphHeight / 2;
    pack.markers.push({ i: markerId, type: "marker-drag-fixture", icon: "📍", cell: 0, x: cx, y: cy, size: 30 });

    return {
      x: cx * window.fmg.view.scale + window.fmg.view.viewX,
      y: cy * window.fmg.view.scale + window.fmg.view.viewY,
      markerId
    };
  });

  await setRenderMode(page, "webglHybrid");
  await page.waitForFunction(
    ({ markerId }) => {
      const deck = window.fmg.view.webglDeck as unknown as {
        props?: { layers?: Array<{ id?: string; props?: { data?: unknown[] } }> };
      } | null;
      const layer = deck?.props?.layers?.find(item => item.id === "fmg-webgl-markers");
      const data = Array.isArray(layer?.props?.data) ? layer.props.data : [];
      return data.some(item => (item as Record<string, unknown>).id === `marker-${markerId}`);
    },
    point,
    { timeout: 5000 }
  );

  return point;
}

export interface WebglPickSnapshot {
  requestedLayerId: string;
  layerId: string;
  kind: string;
  id: string;
  cellId: number | null;
  index: number;
  coordinate: [number, number, number?] | null;
  x: number;
  y: number;
}

export interface WebglCandidateSnapshot {
  layerId: string;
  kind: string;
  id: string;
  cellId: number | null;
  index: number;
  coordinate: [number, number, number?] | null;
  x: number;
  y: number;
}

export interface WebglPickCandidatesSnapshot {
  primary: WebglCandidateSnapshot | null;
  candidates: WebglCandidateSnapshot[];
  legacyPick: WebglCandidateSnapshot | null;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

export async function clickAndGetWebglPickCandidates(
  page: Page,
  point: { x: number; y: number }
): Promise<WebglPickCandidatesSnapshot> {
  await page.evaluate(() => {
    type TestWindow = Window & {
      __fmgWebglPickCandidatesSnapshot?: Omit<WebglPickCandidatesSnapshot, "legacyPick">;
      __fmgWebglLegacyPickSnapshot?: WebglCandidateSnapshot | null;
    };
    const testWindow = window as TestWindow;
    testWindow.__fmgWebglPickCandidatesSnapshot = undefined;
    testWindow.__fmgWebglLegacyPickSnapshot = null;

    function normalizePick(value: unknown): WebglCandidateSnapshot | null {
      if (!value || typeof value !== "object") return null;
      const record = value as Record<string, unknown>;
      const coordinate = Array.isArray(record.coordinate)
        ? ([record.coordinate[0], record.coordinate[1], record.coordinate[2]].filter(
            item => typeof item === "number"
          ) as [number, number, number?])
        : null;
      return {
        layerId: typeof record.layerId === "string" ? record.layerId : "",
        kind: typeof record.kind === "string" ? record.kind : "",
        id: typeof record.id === "string" ? record.id : "",
        cellId: typeof record.cellId === "number" ? record.cellId : null,
        index: typeof record.index === "number" ? record.index : -1,
        coordinate,
        x: typeof record.x === "number" ? record.x : 0,
        y: typeof record.y === "number" ? record.y : 0
      };
    }

    document.addEventListener(
      "fmg:webgl-map-pick-candidates",
      event => {
        const detail = (event as CustomEvent<Record<string, unknown>>).detail;
        const rawCandidates = Array.isArray(detail.candidates) ? detail.candidates : [];
        testWindow.__fmgWebglPickCandidatesSnapshot = {
          primary: normalizePick(detail.primary),
          candidates: rawCandidates.map(normalizePick).filter((item): item is WebglCandidateSnapshot => item !== null),
          x: typeof detail.x === "number" ? detail.x : 0,
          y: typeof detail.y === "number" ? detail.y : 0,
          clientX: typeof detail.clientX === "number" ? detail.clientX : 0,
          clientY: typeof detail.clientY === "number" ? detail.clientY : 0
        };
      },
      { once: true }
    );

    document.addEventListener(
      "fmg:webgl-map-pick",
      event => {
        testWindow.__fmgWebglLegacyPickSnapshot = normalizePick((event as CustomEvent<unknown>).detail);
      },
      { once: true }
    );
  });

  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() =>
    Boolean((window as { __fmgWebglPickCandidatesSnapshot?: unknown }).__fmgWebglPickCandidatesSnapshot)
  );
  return page.evaluate(() => {
    const testWindow = window as Window & {
      __fmgWebglPickCandidatesSnapshot?: Omit<WebglPickCandidatesSnapshot, "legacyPick">;
      __fmgWebglLegacyPickSnapshot?: WebglCandidateSnapshot | null;
    };
    const candidatesSnapshot = testWindow.__fmgWebglPickCandidatesSnapshot;
    if (!candidatesSnapshot) throw new Error("Missing WebGL pick candidates snapshot");
    return {
      ...candidatesSnapshot,
      legacyPick: testWindow.__fmgWebglLegacyPickSnapshot ?? null
    };
  });
}

export interface WebglLayerDatumIdentity {
  layerId: string;
  kind: string;
  id: string;
  cellId: number | null;
}

export async function getFirstWebglLayerDatumIdentity(
  page: Page,
  layerId: string
): Promise<WebglLayerDatumIdentity | null> {
  return page.evaluate(requestedLayerId => {
    function isRecord(value: unknown): value is Record<string, unknown> {
      return value !== null && typeof value === "object";
    }

    function numberValue(value: unknown): number | null {
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }

    const deck = window.fmg.view.webglDeck as unknown as {
      props?: { layers?: Array<{ id?: string; props?: { data?: unknown } }> };
    } | null;
    const layer = deck?.props?.layers?.find(candidate => candidate.id === requestedLayerId);
    const data = Array.isArray(layer?.props?.data) ? layer.props.data.filter(isRecord) : [];
    const datum = data.find(item => typeof item.kind === "string" && typeof item.id === "string");
    if (!datum || typeof datum.kind !== "string" || typeof datum.id !== "string") return null;

    return {
      layerId: requestedLayerId,
      kind: datum.kind,
      id: datum.id,
      cellId: numberValue(datum.cellId)
    };
  }, layerId);
}

export async function pickFirstWebglLayerDatum(
  page: Page,
  layerId: string,
  radius = 12
): Promise<WebglPickSnapshot | null> {
  return page.evaluate(
    ({ requestedLayerId, pickingRadius }) => {
      type DeckDatum = Record<string, unknown>;
      type DeckLayerLike = { id?: string; props?: { data?: unknown } };
      type DeckLike = {
        props?: { layers?: DeckLayerLike[] };
        pickObject?: (options: { x: number; y: number; radius: number; layerIds: string[] }) => unknown;
      };

      function isRecord(value: unknown): value is DeckDatum {
        return value !== null && typeof value === "object";
      }

      function isNumberPair(value: unknown): value is [number, number] {
        return (
          Array.isArray(value) &&
          typeof value[0] === "number" &&
          Number.isFinite(value[0]) &&
          typeof value[1] === "number" &&
          Number.isFinite(value[1])
        );
      }

      function getPointList(value: unknown): Array<[number, number]> {
        return Array.isArray(value) ? value.filter(isNumberPair) : [];
      }

      function getCentroid(points: Array<[number, number]>): [number, number] | null {
        if (!points.length) return null;
        const sums = points.reduce(
          (acc, point) => ({ x: acc.x + point[0], y: acc.y + point[1] }),
          { x: 0, y: 0 }
        );
        return [sums.x / points.length, sums.y / points.length];
      }

      function getMapPoint(datum: DeckDatum): [number, number] | null {
        if (isNumberPair(datum.position)) return datum.position;
        const polygon = getPointList(datum.polygon);
        if (polygon.length) return getCentroid(polygon);
        const path = getPointList(datum.path);
        if (path.length) return path[Math.floor(path.length / 2)] ?? null;
        return null;
      }

      function numberValue(value: unknown): number | null {
        return typeof value === "number" && Number.isFinite(value) ? value : null;
      }

      const deck = window.fmg.view.webglDeck as DeckLike | null;
      const layer = deck?.props?.layers?.find(candidate => candidate.id === requestedLayerId);
      const data = Array.isArray(layer?.props?.data) ? layer.props.data.filter(isRecord) : [];
      const datum = data.find(item => getMapPoint(item) !== null);
      const mapPoint = datum ? getMapPoint(datum) : null;
      if (!deck?.pickObject || !datum || !mapPoint) return null;

      const x = mapPoint[0] * window.fmg.view.scale + window.fmg.view.viewX;
      const y = mapPoint[1] * window.fmg.view.scale + window.fmg.view.viewY;
      const picked = deck.pickObject({ x, y, radius: pickingRadius, layerIds: [requestedLayerId] });
      if (!isRecord(picked) || !isRecord(picked.object)) return null;

      const pickedObject = picked.object;
      const pickedLayer = isRecord(picked.layer) ? picked.layer : null;
      const pickedLayerId = typeof pickedLayer?.id === "string" ? pickedLayer.id : requestedLayerId;
      const kind = typeof pickedObject.kind === "string" ? pickedObject.kind : "";
      const id = typeof pickedObject.id === "string" ? pickedObject.id : "";
      if (!kind || !id) return null;

      const rawCoordinate = Array.isArray(picked.coordinate) ? picked.coordinate : null;
      const coordinate =
        typeof rawCoordinate?.[0] === "number" && typeof rawCoordinate[1] === "number"
          ? ([rawCoordinate[0], rawCoordinate[1], rawCoordinate[2]].filter(value => typeof value === "number") as [
              number,
              number,
              number?
            ])
          : null;

      return {
        requestedLayerId,
        layerId: pickedLayerId,
        kind,
        id,
        cellId: numberValue(pickedObject.cellId),
        index: numberValue(picked.index) ?? -1,
        coordinate,
        x: numberValue(picked.x) ?? x,
        y: numberValue(picked.y) ?? y
      };
    },
    { requestedLayerId: layerId, pickingRadius: radius }
  );
}

export async function zoomToMapCenter(page: Page, scale: number): Promise<void> {
  await page.evaluate(
    zoomScale => {
      window.fmg.actions.zoomTo(window.fmg.world.graphWidth / 2, window.fmg.world.graphHeight / 2, zoomScale, 0);
    },
    scale
  );
  await page.waitForFunction(zoomScale => Math.abs(window.fmg.view.scale - zoomScale) < 0.01, scale, {
    timeout: 5000
  });
}

export async function getViewTransformState(page: Page): Promise<ViewTransformState> {
  return page.evaluate(() => ({
    scale: window.fmg.view.scale,
    viewX: window.fmg.view.viewX,
    viewY: window.fmg.view.viewY
  }));
}

export async function getWebglCanvasPixelStats(page: Page): Promise<CanvasPixelStats> {
  return page.evaluate(() => {
    const source = document.getElementById("webglMapCanvas");
    if (!(source instanceof HTMLCanvasElement)) {
      return {
        nonTransparentPixels: 0,
        coloredPixels: 0,
        alphaBoundingArea: 0,
        alphaBoundingWidth: 0,
        alphaBoundingHeight: 0,
        width: 0,
        height: 0
      };
    }

    const width = Math.max(1, Math.min(source.width, 240));
    const height = Math.max(1, Math.min(source.height, 160));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return {
        nonTransparentPixels: 0,
        coloredPixels: 0,
        alphaBoundingArea: 0,
        alphaBoundingWidth: 0,
        alphaBoundingHeight: 0,
        width: source.width,
        height: source.height
      };
    }

    context.drawImage(source, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    let nonTransparentPixels = 0;
    let coloredPixels = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] ?? 0;
      if (alpha > 0) {
        nonTransparentPixels++;
        const pixelIndex = index / 4;
        const x = pixelIndex % width;
        const y = Math.floor(pixelIndex / width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if ((data[index] ?? 0) !== 0 || (data[index + 1] ?? 0) !== 0 || (data[index + 2] ?? 0) !== 0) {
        coloredPixels++;
      }
    }

    const alphaBoundingWidth = maxX >= minX ? maxX - minX + 1 : 0;
    const alphaBoundingHeight = maxY >= minY ? maxY - minY + 1 : 0;
    return {
      nonTransparentPixels,
      coloredPixels,
      alphaBoundingArea: alphaBoundingWidth * alphaBoundingHeight,
      alphaBoundingWidth,
      alphaBoundingHeight,
      width: source.width,
      height: source.height
    };
  });
}

export async function waitForWebglCanvasPixels(page: Page, minColoredPixels = 500): Promise<CanvasPixelStats> {
  await page.waitForFunction(
    minimum => {
      const source = document.getElementById("webglMapCanvas");
      if (!(source instanceof HTMLCanvasElement) || source.width === 0 || source.height === 0) return false;

      const width = Math.max(1, Math.min(source.width, 160));
      const height = Math.max(1, Math.min(source.height, 100));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return false;
      context.drawImage(source, 0, 0, width, height);
      const data = context.getImageData(0, 0, width, height).data;
      let colored = 0;
      let nonTransparent = 0;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let index = 0; index < data.length; index += 4) {
        if ((data[index + 3] ?? 0) > 0) {
          nonTransparent++;
          const pixelIndex = index / 4;
          const x = pixelIndex % width;
          const y = Math.floor(pixelIndex / width);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        if ((data[index] ?? 0) !== 0 || (data[index + 1] ?? 0) !== 0 || (data[index + 2] ?? 0) !== 0) colored++;
      }
      const alphaBoundingArea = maxX >= minX && maxY >= minY ? (maxX - minX + 1) * (maxY - minY + 1) : 0;
      return colored >= minimum && nonTransparent >= minimum && alphaBoundingArea >= minimum;
    },
    minColoredPixels,
    { timeout: 15000 }
  );
  return getWebglCanvasPixelStats(page);
}

// The `canvas3d` viewMesh canvas is drawn by THREE.WebGPURenderer against a `webgpu` canvas
// context. Directly `context2d.drawImage(sourceCanvas, ...)`-ing (or `createImageBitmap`-ing) a
// `webgpu`-context canvas silently yields all-zero pixels in Chromium — `toDataURL()` on the same
// canvas at the same instant does return the real frame, so every pixel-sampling helper below
// round-trips through a data URL / <img> instead of drawing the source canvas directly. This is
// unrelated to (and unaffected by) `#webglMapCanvas`, which stays on a real `webgl2` context.
// (Each function inlines this rather than sharing a closure: page.evaluate/waitForFunction
// callbacks are serialized and run in-browser, so they can't reference an outer helper function.)

/** Waits until a canvas has enough non-black pixels to prove that its renderer produced a frame. */
export async function waitForCanvasPixels(page: Page, canvasId: string, minColoredPixels = 500): Promise<void> {
  await page.waitForFunction(
    async ({ id, minimum }) => {
      const source = document.getElementById(id);
      if (!(source instanceof HTMLCanvasElement) || source.width === 0 || source.height === 0) return false;

      const width = Math.max(1, Math.min(source.width, 160));
      const height = Math.max(1, Math.min(source.height, 100));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return false;

      const dataUrl = source.toDataURL("image/png");
      const img = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to decode canvas snapshot"));
      });
      img.src = dataUrl;
      await loaded;

      context.drawImage(img, 0, 0, width, height);
      const data = context.getImageData(0, 0, width, height).data;
      let colored = 0;
      for (let index = 0; index < data.length; index += 4) {
        if ((data[index] ?? 0) !== 0 || (data[index + 1] ?? 0) !== 0 || (data[index + 2] ?? 0) !== 0) colored++;
      }
      return colored >= minimum;
    },
    { id: canvasId, minimum: minColoredPixels },
    { timeout: 15000 }
  );
}

/** A compact colour fingerprint for asserting that a canvas frame was actually replaced. */
export async function getCanvasColorChecksum(page: Page, canvasId: string): Promise<number> {
  return page.evaluate(async id => {
    const source = document.getElementById(id);
    if (!(source instanceof HTMLCanvasElement) || source.width === 0 || source.height === 0) return 0;

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 40;
    const context = canvas.getContext("2d");
    if (!context) return 0;

    const dataUrl = source.toDataURL("image/png");
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to decode canvas snapshot"));
    });
    img.src = dataUrl;
    await loaded;
    context.drawImage(img, 0, 0, canvas.width, canvas.height);

    let checksum = 2166136261;
    for (const value of context.getImageData(0, 0, canvas.width, canvas.height).data) {
      checksum = Math.imul(checksum ^ value, 16777619) >>> 0;
    }
    return checksum;
  }, canvasId);
}

/**
 * Counts distinct (coarsely-bucketed) RGB colors in a canvas's downsampled content. This is what
 * actually separates "renders the full, detailed map" from "renders a zoomed-in, mostly-uniform
 * crop" for the 3D terrain texture: an exact-hash checksum (`getCanvasColorChecksum`) decorrelates
 * from harmless per-frame rendering noise (water shimmer, anti-aliasing jitter across separate
 * mesh rebuilds) just as much as it would from a genuine regression, and a raw per-pixel diff
 * measured ~16-20/255 for both a same-content pair and a deliberately cropped-viewport regression
 * (both captures share large solid-black letterboxing and solid-blue ocean regions that swamp the
 * actual signal) — whereas distinct color count measured 73-75 for two genuinely-same-content
 * full-map captures vs. 14 for a reproduced cropped-viewport regression, a wide, reliable margin.
 */
export async function getCanvasColorDiversity(page: Page, canvasId: string, bucket = 16): Promise<number> {
  return page.evaluate(
    async ({ id, bucket }) => {
      const source = document.getElementById(id);
      if (!(source instanceof HTMLCanvasElement) || source.width === 0 || source.height === 0) return 0;

      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 40;
      const context = canvas.getContext("2d");
      if (!context) return 0;

      const dataUrl = source.toDataURL("image/png");
      const img = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to decode canvas snapshot"));
      });
      img.src = dataUrl;
      await loaded;
      context.drawImage(img, 0, 0, canvas.width, canvas.height);

      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const seen = new Set<string>();
      for (let index = 0; index < data.length; index += 4) {
        const r = Math.floor((data[index] ?? 0) / bucket);
        const g = Math.floor((data[index + 1] ?? 0) / bucket);
        const b = Math.floor((data[index + 2] ?? 0) / bucket);
        seen.add(`${r},${g},${b}`);
      }
      return seen.size;
    },
    { id: canvasId, bucket }
  );
}

export interface CanvasLuminanceStats {
  averageLuminance: number;
  nearWhiteRatio: number;
  sampledPixels: number;
}

/** Samples a canvas colour distribution without relying on pixel-perfect 3D camera alignment. */
export async function getCanvasLuminanceStats(page: Page, canvasId: string): Promise<CanvasLuminanceStats> {
  return page.evaluate(id => {
    const source = document.getElementById(id);
    if (!(source instanceof HTMLCanvasElement) || source.width === 0 || source.height === 0) {
      return { averageLuminance: 0, nearWhiteRatio: 0, sampledPixels: 0 };
    }

    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) return { averageLuminance: 0, nearWhiteRatio: 0, sampledPixels: 0 };
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    let totalLuminance = 0;
    let nearWhite = 0;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      totalLuminance += red * 0.2126 + green * 0.7152 + blue * 0.0722;
      if (red >= 245 && green >= 245 && blue >= 245) nearWhite++;
    }
    const sampledPixels = canvas.width * canvas.height;
    return {
      averageLuminance: totalLuminance / sampledPixels,
      nearWhiteRatio: nearWhite / sampledPixels,
      sampledPixels
    };
  }, canvasId);
}

export interface SvgLayerPresence {
  ocean: boolean;
  lakes: boolean;
  coastline: boolean;
  rivers: boolean;
  borders: boolean;
  burgs: boolean;
  labels: boolean;
}

/** Return boolean presence for each core SVG layer group. */
export async function getSvgLayerPresence(page: Page): Promise<SvgLayerPresence> {
  return page.evaluate(() => ({
    ocean: !!document.getElementById("ocean"),
    lakes: !!document.getElementById("lakes"),
    coastline: !!document.getElementById("coastline"),
    rivers: !!document.getElementById("rivers"),
    borders: !!document.getElementById("borders"),
    burgs: !!document.getElementById("burgIcons"),
    labels: !!document.getElementById("labels"),
  }));
}

export interface MapDataSummary {
  hasStates: boolean;
  hasBurgs: boolean;
  hasCells: boolean;
  hasRivers: boolean;
  mapId: number | undefined;
}

/** Return a summary of core world data for post-load assertions. */
export async function getMapDataSummary(page: Page): Promise<MapDataSummary> {
  return page.evaluate(() => {
    const { pack } = window.fmg.world;
    return {
      hasStates: pack.states != null && pack.states.length > 1,
      hasBurgs: pack.burgs != null && pack.burgs.length > 1,
      hasCells: pack.cells != null && pack.cells.i != null && pack.cells.i.length > 0,
      hasRivers: pack.rivers != null && pack.rivers.length > 0,
      mapId: window.fmg.world.mapId,
    };
  });
}

export interface PackStatesSummary {
  count: number;
  allHaveNames: boolean;
  allHaveCells: boolean;
  allHaveArea: boolean;
}

/** Return summary of non-neutral states for post-load assertions. */
export async function getPackStatesSummary(page: Page): Promise<PackStatesSummary> {
  return page.evaluate(() => {
    const { pack } = window.fmg.world;
    const states = (
      pack.states as Array<{ i: number; name?: string; cells?: number; area?: number }>
    ).filter((s) => s.i !== 0);
    return {
      count: states.length,
      allHaveNames: states.every((s) => s.name != null && s.name.length > 0),
      allHaveCells: states.every((s) => (s.cells ?? 0) > 0),
      allHaveArea: states.every((s) => (s.area ?? 0) > 0),
    };
  });
}

export interface PackBurgsSummary {
  count: number;
  allHaveNames: boolean;
  allHaveCoords: boolean;
  allHaveCells: boolean;
}

/** Return summary of active burgs for post-load assertions. */
export async function getPackBurgsSummary(page: Page): Promise<PackBurgsSummary> {
  return page.evaluate(() => {
    const { pack } = window.fmg.world;
    const burgs = (
      pack.burgs as unknown as Array<{
        i: number;
        removed?: boolean;
        name?: string;
        x?: number;
        y?: number;
        cell?: number;
      }>
    ).filter((b) => b.i !== 0 && !b.removed && b.name);
    return {
      count: burgs.length,
      allHaveNames: burgs.every((b) => b.name != null && b.name.length > 0),
      allHaveCoords: burgs.every(
        (b) => typeof b.x === "number" && typeof b.y === "number"
      ),
      allHaveCells: burgs.every((b) => typeof b.cell === "number"),
    };
  });
}

// ── Burg helpers ─────────────────────────────────────────────────────────────

export interface InlandBurgInfo {
  burgId: number;
  port: number | undefined;
  portType: string;
  portIsFalsy: boolean;
  x: number;
  y: number;
}

/**
 * Find an inland burg without a port and return detailed property info.
 * Returns { error } if no matching burg exists.
 */
export async function findInlandBurgInfo(
  page: Page
): Promise<InlandBurgInfo | { error: string }> {
  return page.evaluate(() => {
    const { cells, burgs } = window.fmg.world.pack;
    for (let b = 1; b < burgs.length; b++) {
      const burg = burgs[b];
      if (!burg || burg.removed) continue;
      if (cells.h[burg.cell] >= 20 && !burg.port) {
        return {
          burgId: b,
          port: burg.port,
          portType: typeof burg.port,
          portIsFalsy: !burg.port,
          x: burg.x,
          y: burg.y,
        };
      }
    }
    return { error: "No inland burg found" };
  });
}

/**
 * Find the index of an inland burg with the given port status.
 * Returns null if no matching burg exists.
 */
export async function findInlandBurg(
  page: Page,
  wantPort: boolean
): Promise<number | null> {
  return page.evaluate((want: boolean) => {
    const { cells, burgs } = window.fmg.world.pack;
    for (let b = 1; b < burgs.length; b++) {
      const burg = burgs[b];
      if (!burg || burg.removed) continue;
      if (cells.h[burg.cell] >= 20 && Boolean(burg.port) === want) return b;
    }
    return null;
  }, wantPort);
}

/**
 * Zoom to a burg and ensure the burg labels/icons layers are visible.
 * Uses window.fmg.actions for setup (permitted by AGENTS.md §5).
 */
export async function setupBurgView(page: Page, burgId: number): Promise<void> {
  await page.evaluate((id: number) => {
    const burg = window.fmg.world.pack.burgs[id];
    if (!window.fmg.actions.layerIsOn("toggleBurgIcons"))
      window.fmg.actions.toggleBurgIcons();
    if (!window.fmg.actions.layerIsOn("toggleLabels"))
      window.fmg.actions.toggleLabels();
    window.fmg.actions.zoomTo(burg.x, burg.y, 4, 0);
  }, burgId);
  await waitForBurgLabels(page);
}

/** Wait for burg label text elements to appear in the DOM. */
export async function waitForBurgLabels(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelectorAll("#burgLabels text").length > 0,
    { timeout: 10000 }
  );
}

// ── Viewport ─────────────────────────────────────────────────────────────────

/**
 * Zoom to the centre of the map at the requested scale.
 * zoomTo with duration=0 is synchronous; callers should wait for the DOM
 * condition they actually care about (e.g. waitForBurgLabels).
 */
export async function zoomIn(page: Page, z = 2): Promise<void> {
  await page.evaluate((scale: number) => {
    const { world, actions } = window.fmg;
    actions.zoomTo(world.graphWidth / 2, world.graphHeight / 2, scale, 0);
  }, z);
}

// ── Dialog helpers ───────────────────────────────────────────────────────────

/** Return true if at least one fmg-dialog is currently visible. */
export async function isAnyDialogOpen(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".fmg-dialog")).some(
      (el) => (el as HTMLElement).style.display !== "none"
    )
  );
}

// ── States helpers ───────────────────────────────────────────────────────────

/**
 * Find the data-id of the first real state row (id > 0) in the States Editor.
 * Returns null if the editor is empty or only contains the neutral state.
 */
export async function findFirstRealStateId(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    // Rows are virtualized <tr data-id> elements inside #statesBodySection's <table>
    // (VirtualTableBody.tsx), not direct-child divs.
    const rows = Array.from(
      document.querySelectorAll("#statesBodySection tr[data-id]")
    ) as HTMLElement[];
    const row = rows.find((r) => parseInt(r.dataset.id!, 10) > 0);
    return row ? parseInt(row.dataset.id!, 10) : null;
  });
}

/**
 * Count non-removed states that still list the given id in their neighbors array.
 * Used to verify a state was fully removed from diplomatic relations.
 */
export async function countStatesWithNeighbor(
  page: Page,
  stateId: number
): Promise<number> {
  return page.evaluate((id: number) => {
    const { states } = window.fmg.world.pack;
    return (
      states as Array<{ i: number; removed?: boolean; neighbors?: number[] }>
    ).filter((s) => s.i && !s.removed && s.neighbors?.includes(id)).length;
  }, stateId);
}

export interface MilitaryRegenerationResult {
  statesCount: number;
  statesWithMilitary: number;
}

/** Return military regeneration summary for assertion. */
export async function getMilitaryRegenerationResult(
  page: Page
): Promise<MilitaryRegenerationResult> {
  return page.evaluate(() => {
    const { states } = window.fmg.world.pack;
    const validStates = (
      states as Array<{ i: number; removed?: boolean; military?: unknown[] }>
    ).filter((s) => s.i && !s.removed);
    return {
      statesCount: validStates.length,
      statesWithMilitary: validStates.filter(
        (s) => s.military && s.military.length > 0
      ).length,
    };
  });
}

// ── Zone helpers ─────────────────────────────────────────────────────────────

/**
 * Programmatically create a contiguous zone of 10-20 land cells via BFS.
 * Returns the new zone's id.
 */
export async function createTestZone(page: Page): Promise<number> {
  return page.evaluate(() => {
    const { cells, zones } = window.fmg.world.pack;

    let startCell = -1;
    for (let i = 1; i < cells.i.length; i++) {
      if (cells.h[i] >= 20) {
        startCell = i;
        break;
      }
    }
    if (startCell === -1) throw new Error("No land cells found to create a test zone");

    const zoneCells: number[] = [];
    const visited = new Set<number>();
    const queue: number[] = [startCell];
    visited.add(startCell);

    while (queue.length > 0 && zoneCells.length < 20) {
      const current = queue.shift() as number;
      if (cells.h[current] >= 20) zoneCells.push(current);
      for (const n of (cells.c[current] as number[] | undefined) ?? []) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
    if (zoneCells.length < 10)
      throw new Error(`Not enough contiguous land cells found: ${zoneCells.length}`);

    const zoneId = zones.length;
    zones.push({
      i: zoneId,
      name: "Test Export Zone",
      type: "Test",
      color: "#FF0000",
      cells: zoneCells,
    });
    return zoneId;
  });
}

/**
 * Create a hidden zone (excluded from GeoJSON export by convention).
 * Returns the new zone's id.
 */
export async function createHiddenTestZone(page: Page): Promise<number> {
  return page.evaluate(() => {
    const { cells, zones } = window.fmg.world.pack;
    const usedCells = new Set<number>(
      (zones as Array<{ cells?: number[] }>).flatMap((z) => z.cells ?? [])
    );

    let startCell = -1;
    for (let i = 1; i < cells.i.length; i++) {
      if (cells.h[i] >= 20 && !usedCells.has(i)) {
        startCell = i;
        break;
      }
    }
    if (startCell === -1)
      throw new Error("No available land cells found for hidden zone");

    const zoneCells: number[] = [];
    const visited = new Set<number>();
    const queue: number[] = [startCell];
    visited.add(startCell);

    while (queue.length > 0 && zoneCells.length < 20) {
      const current = queue.shift() as number;
      if (cells.h[current] >= 20 && !usedCells.has(current)) zoneCells.push(current);
      for (const n of (cells.c[current] as number[] | undefined) ?? []) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
    if (zoneCells.length < 10)
      throw new Error(`Not enough contiguous land cells found: ${zoneCells.length}`);

    const zoneId = zones.length;
    zones.push({
      i: zoneId,
      name: "Hidden Test Zone",
      type: "Test",
      color: "#00FF00",
      cells: zoneCells,
      hidden: true,
    });
    return zoneId;
  });
}

/**
 * Create a zone with an empty cells array (excluded from GeoJSON export).
 * Returns the new zone's id.
 */
export async function createEmptyTestZone(page: Page): Promise<number> {
  return page.evaluate(() => {
    const { zones } = window.fmg.world.pack;
    const zoneId = zones.length;
    zones.push({
      i: zoneId,
      name: "Empty Test Zone",
      type: "Test",
      color: "#0000FF",
      cells: [],
    });
    return zoneId;
  });
}

/** Build and return the zones GeoJSON without triggering a file download. */
export async function getGeoJsonZones(page: Page): Promise<unknown> {
  return page.evaluate(() => window.fmg.actions.getGeoJsonZones());
}

/** Return the zone object for the given id from pack.zones, or null if not found. */
export async function getZoneById(page: Page, id: number): Promise<unknown> {
  return page.evaluate((zoneId: number) => {
    const { zones } = window.fmg.world.pack;
    return (zones as unknown as Array<{ i: number }>).find((z) => z.i === zoneId) ?? null;
  }, id);
}

// ── Tour helpers ─────────────────────────────────────────────────────────────

/** Read the current driver.js popover title. */
export async function getTourPopoverTitle(page: Page): Promise<string> {
  return (await page.locator(".driver-popover-title").innerText()).trim();
}

/** Click Next and wait for the popover title to transition to expectedTitle. */
export async function tourNextStep(page: Page, expectedTitle: string): Promise<void> {
  await page.locator(".driver-popover-next-btn").click();
  await page.waitForFunction(
    (title: string) =>
      document.querySelector(".driver-popover-title")?.textContent?.trim() === title,
    expectedTitle,
    { timeout: 5000 }
  );
}

/** Click Previous and wait for the popover title to transition to expectedTitle. */
export async function tourPrevStep(page: Page, expectedTitle: string): Promise<void> {
  await page.locator(".driver-popover-prev-btn").click();
  await page.waitForFunction(
    (title: string) =>
      document.querySelector(".driver-popover-title")?.textContent?.trim() === title,
    expectedTitle,
    { timeout: 5000 }
  );
}

/**
 * Click Next N times, waiting for the popover title to change on each click.
 * Use when advancing multiple steps without asserting intermediate titles.
 */
export async function tourAdvanceSteps(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const currentTitle = await getTourPopoverTitle(page);
    await page.locator(".driver-popover-next-btn").click();
    await page.waitForFunction(
      (prev: string) =>
        document.querySelector(".driver-popover-title")?.textContent?.trim() !== prev,
      currentTitle,
      { timeout: 5000 }
    );
  }
}
