import type { Page } from "@playwright/test";
import path from "path";

export interface CanvasPixelStats {
  nonTransparentPixels: number;
  coloredPixels: number;
  width: number;
  height: number;
}

export interface ViewTransformState {
  scale: number;
  viewX: number;
  viewY: number;
}

// ── Map lifecycle ────────────────────────────────────────────────────────────

/**
 * Wait until window.fmg is populated and map generation is complete.
 * Uses window.fmg.world.mapId (the canonical post-generation signal).
 */
export async function waitForMapGeneration(page: Page, timeout = 60000): Promise<void> {
  await page.waitForFunction(
    () => typeof window.fmg !== "undefined" && window.fmg.world.mapId !== undefined,
    { timeout }
  );
}

/**
 * Wait for map generation and for the SVG viewbox to have rendered content.
 * Replaces the pattern: waitForMapGeneration() + waitForTimeout(500).
 */
export async function waitForMapLoad(page: Page, timeout = 60000): Promise<void> {
  await waitForMapGeneration(page, timeout);
  await page.waitForFunction(
    () => {
      const viewbox = document.getElementById("viewbox");
      return viewbox !== null && viewbox.children.length > 5;
    },
    { timeout: 10000 }
  );
}

/**
 * Upload a saved .map file from tests/fixtures/ into the current app session.
 * Returns after the loaded map id and SVG viewbox are available.
 */
export async function uploadMapFixture(page: Page, filename: string): Promise<void> {
  await waitForMapLoad(page);
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
}

/**
 * Navigate to "/" and load a saved .map file from tests/fixtures/.
 * Returns after the loaded map id and SVG viewbox are available.
 */
export async function loadMapFile(page: Page, filename: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await uploadMapFixture(page, filename);
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

export async function setRenderMode(page: Page, mode: "svg" | "webglHybrid"): Promise<void> {
  await page.evaluate(renderMode => window.fmg.actions.setRenderMode(renderMode), mode);
}

export async function setLayerPreset(page: Page, preset: string): Promise<void> {
  await page.evaluate(layerPreset => window.fmg.actions.handleLayersPresetChange(layerPreset), preset);
}

export async function getWebglDeckLayerIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const deck = window.fmg.view.webglDeck as unknown as { props?: { layers?: Array<{ id?: string }> } } | null;
    return deck?.props?.layers?.map(layer => layer.id).filter((id): id is string => typeof id === "string") ?? [];
  });
}

export interface WebglRendererDomState {
  bodyHasHybridClass: boolean;
  canvasDisplay: string;
  landmassHasManagedClass: boolean;
  landmassDisplay: string;
  scaleBarHasOverlayClass: boolean;
  scaleBarDisplay: string;
  deckHasTestMarker: boolean;
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
    const deck = window.fmg.view.webglDeck as unknown as { __testMarker?: string; canvas?: HTMLCanvasElement } | null;

    return {
      bodyHasHybridClass: document.body.classList.contains("fmg-webgl-hybrid"),
      canvasDisplay: canvas ? window.getComputedStyle(canvas).display : "",
      landmassHasManagedClass: Boolean(landmass?.classList.contains("fmg-webgl-managed-svg-layer")),
      landmassDisplay: landmass ? window.getComputedStyle(landmass).display : "",
      scaleBarHasOverlayClass: Boolean(scaleBar?.classList.contains("fmg-webgl-svg-overlay-layer")),
      scaleBarDisplay: scaleBar ? window.getComputedStyle(scaleBar).display : "",
      deckHasTestMarker: deck?.__testMarker === "before-map-load",
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
      return { nonTransparentPixels: 0, coloredPixels: 0, width: 0, height: 0 };
    }

    const width = Math.max(1, Math.min(source.width, 240));
    const height = Math.max(1, Math.min(source.height, 160));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return { nonTransparentPixels: 0, coloredPixels: 0, width: source.width, height: source.height };

    context.drawImage(source, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    let nonTransparentPixels = 0;
    let coloredPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] ?? 0;
      if (alpha > 0) nonTransparentPixels++;
      if ((data[index] ?? 0) !== 0 || (data[index + 1] ?? 0) !== 0 || (data[index + 2] ?? 0) !== 0) {
        coloredPixels++;
      }
    }

    return { nonTransparentPixels, coloredPixels, width: source.width, height: source.height };
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
      for (let index = 0; index < data.length; index += 4) {
        if ((data[index] ?? 0) !== 0 || (data[index + 1] ?? 0) !== 0 || (data[index + 2] ?? 0) !== 0) colored++;
      }
      return colored >= minimum;
    },
    minColoredPixels,
    { timeout: 15000 }
  );
  return getWebglCanvasPixelStats(page);
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
    const rows = Array.from(
      document.querySelectorAll("#statesBodySection > div[data-id]")
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
