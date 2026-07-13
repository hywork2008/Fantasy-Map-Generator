import { expect, type Page, test } from "@playwright/test";
import {
  HYBRID_SVG_OVERLAY_LAYER_IDS,
  WEBGL_MANAGED_SVG_LAYER_IDS
} from "../../src/renderers/webgl/hybridLayerPolicy";
import {
  applyStylePreset,
  clickAndGetWebglPickCandidates,
  ensureLayerOn,
  forceOverlappingWebglRegiments,
  forceWebglGlacierFixture,
  forceWebglIcebergFixture,
  forceWebglMarkerFixture,
  getFirstLandScreenPoint,
  getFirstStateScreenPoint,
  getToastText,
  getWebglBurgIconSummary,
  getWebglDeckLayerIds,
  getWebglCanvasPixelStats,
  getWebglEmblemIconSummary,
  getWebglLabelLayerSettings,
  getWebglLayerRenderingProps,
  getWebglMarkerIconState,
  getWebglLayerStyleSamples,
  getWebglStyleComparisons,
  getWebglLayerPolicyState,
  getWebglRendererDomState,
  getFirstWebglLayerDatumIdentity,
  pickFirstWebglLayerDatum,
  getViewTransformState,
  markCurrentWebglDeck,
  setLayerPreset,
  setRenderMode,
  toggleLayer,
  uploadMapFixture,
  waitForMapLoad,
  waitForWebglCanvasPixels,
  zoomToMapCenter
} from "./helpers/fmg-helpers";

async function getTopElementAtCenter(page: Page, selector: string) {
  return page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect();
    const topElement = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      id: topElement?.id ?? "",
      tagName: topElement?.tagName ?? "",
      className: topElement instanceof HTMLElement ? topElement.className : "",
      targetZIndex: window.getComputedStyle(element).zIndex,
      topZIndex: topElement ? window.getComputedStyle(topElement).zIndex : ""
    };
  });
}

async function isTopElementWithin(page: Page, selector: string, expectedAncestor: string): Promise<boolean> {
  return page.locator(selector).evaluate(
    (element, ancestorSelector) => {
      const rect = element.getBoundingClientRect();
      const topElement = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return Boolean(topElement?.closest(ancestorSelector));
    },
    expectedAncestor
  );
}

async function closeAllOpenEditorDialogs(page: Page): Promise<void> {
  // Not every editor dialog is tracked by the shared dialogStore (e.g. burg/marker/lake/ice
  // editors use their own Zustand "isOpen" state), so "Close all dialogs" alone can leave one
  // open and stacked behind the next dialog. Click each visible dialog's own Close button
  // directly via the DOM instead of a simulated pointer click, which sidesteps z-order stacking.
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>(".fmg-dialog").forEach(dialog => {
      if (dialog.style.display === "none") return;
      dialog.querySelector<HTMLButtonElement>('.titlebar-btn[aria-label="Close"]')?.click();
    });
  });
}

async function clickWebglEditTargetAndExpectEditor(
  page: Page,
  target: { layerId: string; kind: string; editorSelector: string }
) {
  await closeAllOpenEditorDialogs(page);

  const pick =
    (await getFirstWebglLayerDatumClickPoint(page, target.layerId)) ??
    (await pickFirstWebglLayerDatum(page, target.layerId, 18));
  expect(pick, target.layerId).not.toBeNull();
  if (!pick) return;

  const pickResult = await clickAndGetWebglPickCandidates(page, pick);
  const candidate =
    pickResult.candidates.find(item => item.kind === target.kind && item.id === pick.id) ??
    pickResult.candidates.find(item => item.kind === target.kind);
  expect(candidate, target.layerId).toMatchObject({
    kind: target.kind,
    id: expect.any(String),
    layerId: target.layerId
  });
  if (!candidate) return;

  const chooserItem = page
    .locator(`#mapPickChooser .map-pick-chooser__item[data-kind="${target.kind}"][data-pick-id="${candidate.id}"]`)
    .first();
  try {
    await expect(chooserItem).toBeVisible({ timeout: 700 });
    await chooserItem.click();
  } catch {
    // Single-candidate clicks dispatch the same selected event without showing the chooser.
  }

  await expect(page.locator(target.editorSelector)).toBeVisible();
}

async function getFirstWebglLayerDatumClickPoint(
  page: Page,
  layerId: string
): Promise<{ kind: string; id: string; x: number; y: number } | null> {
  return page.evaluate(requestedLayerId => {
    type DeckDatum = Record<string, unknown>;
    type DeckLayerLike = { id?: string; props?: { data?: unknown } };
    type DeckLike = { props?: { layers?: DeckLayerLike[] } };

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

    const deck = window.fmg.view.webglDeck as DeckLike | null;
    const layer = deck?.props?.layers?.find(candidate => candidate.id === requestedLayerId);
    const data = Array.isArray(layer?.props?.data) ? layer.props.data.filter(isRecord) : [];
    for (const datum of data) {
      const mapPoint = getMapPoint(datum);
      const kind = typeof datum.kind === "string" ? datum.kind : "";
      const id = typeof datum.id === "string" ? datum.id : "";
      if (!mapPoint || !kind || !id) continue;

      const x = mapPoint[0] * window.fmg.view.scale + window.fmg.view.viewX;
      const y = mapPoint[1] * window.fmg.view.scale + window.fmg.view.viewY;
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;

      const topElement = document.elementFromPoint(x, y);
      if (topElement?.closest("#options, .fmg-dialog, #tourPromptButton, #mapOverlay")) continue;
      return { kind, id, x, y };
    }

    return null;
  }, layerId);
}

async function getMarkerPosition(page: Page, markerId: number): Promise<{ x: number; y: number } | null> {
  return page.evaluate(id => {
    type TestMarker = { i: number; x?: number; y?: number };
    const markers = window.fmg.world.pack.markers as TestMarker[];
    const marker = markers.find(item => item.i === id);
    return marker ? { x: marker.x ?? 0, y: marker.y ?? 0 } : null;
  }, markerId);
}

async function getIceOffset(page: Page, iceId: number): Promise<[number, number] | null> {
  return page.evaluate(id => {
    type TestIce = { i: number; offset?: [number, number] };
    const ice = (window.fmg.world.pack.ice as TestIce[]).find(item => item.i === id);
    return ice?.offset ?? [0, 0];
  }, iceId);
}

test.describe("webgl hybrid renderer", () => {
  test("switches WebGL rendering on and off with an accessible toggle", async ({ page }) => {
    await page.goto("/?seed=webgl-renderer-toggle&width=1000&height=700");
    await waitForMapLoad(page);

    if ((await page.locator("#optionsHide").textContent())?.trim() === "►") {
      await page.locator("#optionsHide").click();
    }
    await page.getByRole("button", { name: "Layers", exact: true }).click();

    const toggle = page.getByRole("switch", { name: "WebGL rendering" });
    await expect(toggle).not.toBeChecked();
    await expect(page.getByText("WebGL rendering", { exact: true })).toBeVisible();

    await toggle.check();
    await expect(toggle).toBeChecked();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("fmg-render-mode"))).toBe("webglHybrid");
    await expect(page.locator("#webglMapCanvas")).toBeVisible();
    await waitForWebglCanvasPixels(page);

    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("fmg-render-mode"))).toBe("svg");
    await expect(page.locator("#webglMapCanvas")).toBeHidden();
  });

  test("renders non-empty canvas and keeps SVG overlays after zoom and resize", async ({ page }) => {
    await page.goto("/?seed=webgl-hybrid&width=1280&height=720");
    await waitForMapLoad(page);

    await setRenderMode(page, "webglHybrid");
    const initialStats = await waitForWebglCanvasPixels(page);
    expect(initialStats.coloredPixels).toBeGreaterThan(500);
    expect(initialStats.nonTransparentPixels).toBeGreaterThan(500);
    expect(initialStats.alphaBoundingArea).toBeGreaterThan(500);
    const desktopScreenshot = await page.locator("#webglMapCanvas").screenshot();
    expect(desktopScreenshot.length).toBeGreaterThan(1000);

    await expect(page.locator("#webglMapCanvas")).toBeVisible();
    await expect(page.locator("#labels")).toBeHidden();
    await expect(page.locator("#scaleBar")).toBeVisible();
    await expect(page.locator("#regions")).toBeHidden();
    await expect(page.locator("#rivers")).toBeHidden();
    await expect(page.locator("#lakes")).toBeHidden();
    await expect(page.locator("#coastline")).toBeHidden();
    await expect(page.locator("#ice")).toBeHidden();
    await expect(page.locator("#terrain")).toBeHidden();
    await expect(page.locator("#emblems")).toBeHidden();
    await expect(page.locator("#icons")).toBeHidden();
    await expect(page.locator("#burgIcons")).toBeHidden();
    await expect(page.locator("#anchors")).toBeHidden();
    await expect(page.locator("#markers")).toBeHidden();
    await expect(page.locator("#armies")).toBeHidden();
    await expect
      .poll(() => getWebglDeckLayerIds(page), { timeout: 5000 })
      .toEqual(
        expect.arrayContaining([
          "fmg-webgl-lakes",
          "fmg-webgl-lakes-outlines",
          "fmg-webgl-coastline",
          "fmg-webgl-ice",
          "fmg-webgl-burg-icons",
          "fmg-webgl-labels"
        ])
      );

    const beforeZoomTransform = await getViewTransformState(page);
    await zoomToMapCenter(page, 3);
    const afterZoomStats = await waitForWebglCanvasPixels(page);
    expect(afterZoomStats.coloredPixels).toBeGreaterThan(500);
    expect(afterZoomStats.nonTransparentPixels).toBeGreaterThan(500);
    expect(afterZoomStats.alphaBoundingArea).toBeGreaterThan(500);
    await expect(page.locator("#labels")).toBeHidden();
    const afterZoomTransform = await getViewTransformState(page);
    expect(beforeZoomTransform).not.toEqual(afterZoomTransform);
    expect(afterZoomTransform.scale).toBeCloseTo(3, 1);

    await page.setViewportSize({ width: 390, height: 720 });
    await page.waitForFunction(() => {
      const canvas = document.getElementById("webglMapCanvas");
      return canvas instanceof HTMLCanvasElement && canvas.style.width === "390px";
    });
    const mobileStats = await waitForWebglCanvasPixels(page);
    expect(mobileStats.width).toBeGreaterThanOrEqual(390);
    expect(mobileStats.coloredPixels).toBeGreaterThan(300);
    expect(mobileStats.nonTransparentPixels).toBeGreaterThan(300);
    expect(mobileStats.alphaBoundingArea).toBeGreaterThan(300);

    const mobileScreenshot = await page.locator("#webglMapCanvas").screenshot();
    expect(mobileScreenshot.length).toBeGreaterThan(1000);
  });

  test("keeps the left options UI above the WebGL canvas and SVG map", async ({ page }) => {
    await page.goto("/?seed=webgl-ui-layering&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);

    await expect(page.locator("#webglMapCanvas")).toBeVisible();
    await expect(page.locator("#options")).toBeVisible();
    await expect(page.locator("#optionsHide")).toBeVisible();
    await expect.poll(() => getTopElementAtCenter(page, "#optionsHide")).toMatchObject({ id: "optionsHide" });

    await page.locator("#optionsHide").click();
    await expect(page.locator("#layersContent")).toBeVisible();
  });

  test("keeps dialogs and the tour prompt above the WebGL canvas", async ({ page }) => {
    await page.goto("/?seed=webgl-ui-stacking&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);

    const tourPrompt = page.locator("#tourPromptButton");
    await expect(tourPrompt).toBeVisible();
    await expect.poll(() => isTopElementWithin(page, "#tourPromptButton button", "#tourPromptButton")).toBe(true);

    await page.locator("#optionsHide").click();
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.locator(".fmg-dialog", { has: page.locator("#exportMapData") });
    await expect(dialog).toBeVisible();
    await expect.poll(() => isTopElementWithin(page, "#exportMapData", ".fmg-dialog")).toBe(true);
  });

  test("exports a visible WebGL map as a composited PNG", async ({ page }) => {
    await page.goto("/?seed=webgl-raster-export&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.locator("#exportMapData").getByRole("button", { name: ".png", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    expect(await download.failure()).toBeNull();

    const stream = await download.createReadStream();
    let size = 0;
    for await (const chunk of stream ?? []) size += chunk.length;
    expect(size).toBeGreaterThan(1000);
    await expect.poll(() => getWebglRendererDomState(page)).toMatchObject({
      bodyHasHybridClass: true,
      deckExists: true,
      deckCanvasMatchesDom: true
    });
  });

  test("saves a WebGL map through a fresh SVG snapshot and restores the deck", async ({ page }) => {
    await page.goto("/?seed=webgl-save-snapshot&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "machine", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.map$/);
    expect(await download.failure()).toBeNull();

    const stream = await download.createReadStream();
    let size = 0;
    for await (const chunk of stream ?? []) size += chunk.length;
    expect(size).toBeGreaterThan(10000);
    await expect.poll(() => getWebglRendererDomState(page)).toMatchObject({
      bodyHasHybridClass: true,
      deckExists: true,
      deckCanvasMatchesDom: true
    });
  });

  test("keeps the deck context alive while a 3D view owns its own canvas", async ({ page }) => {
    await page.goto("/?seed=webgl-3d-context&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);

    await page.locator("#optionsHide").click();
    await page.locator("#layersTab").click();
    await page.locator("#viewMesh").click();

    await expect(page.locator("#canvas3d")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#map")).toBeHidden();
    await expect(page.locator("#webglMapCanvas")).toBeHidden();
    await expect.poll(() => getWebglRendererDomState(page)).toMatchObject({ deckExists: true });

    await page.locator("#viewStandard").click();
    await expect(page.locator("#canvas3d")).toHaveCount(0);
    await expect(page.locator("#map")).toBeVisible();
    await expect(page.locator("#webglMapCanvas")).toBeVisible();
    await expect.poll(() => getWebglRendererDomState(page)).toMatchObject({
      bodyHasHybridClass: true,
      deckExists: true,
      deckCanvasMatchesDom: true
    });
  });

  test("applies the hybrid SVG layer policy to managed map layers and overlays", async ({ page }) => {
    await page.goto("/?seed=webgl-layer-policy&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);

    const managedLayers = await getWebglLayerPolicyState(page, WEBGL_MANAGED_SVG_LAYER_IDS);
    for (const layer of managedLayers) {
      expect(layer, layer.id).toMatchObject({
        exists: true,
        display: "none",
        hasManagedClass: true,
        hasOverlayClass: false
      });
    }

    const overlayLayers = await getWebglLayerPolicyState(page, HYBRID_SVG_OVERLAY_LAYER_IDS);
    for (const layer of overlayLayers) {
      expect(layer, layer.id).toMatchObject({
        exists: true,
        hasManagedClass: false,
        hasOverlayClass: true
      });
    }
    expect(overlayLayers.find(layer => layer.id === "scaleBar")?.display).not.toBe("none");
    expect(overlayLayers.find(layer => layer.id === "calendar")?.display).not.toBe("none");
  });

  test("keeps texture and relief available as SVG overlays in WebGL hybrid mode", async ({ page }) => {
    await page.goto("/?seed=webgl-residual-overlays&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);

    await toggleLayer(page, "toggleTexture");
    await toggleLayer(page, "toggleRelief");

    await expect(page.locator("#texture image")).toHaveCount(1);
    await expect(page.locator("#terrain use").first()).toBeVisible();
    await expect
      .poll(() => getWebglDeckLayerIds(page), { timeout: 5000 })
      .not.toEqual(expect.arrayContaining(["fmg-webgl-texture", "fmg-webgl-terrain"]));

    const overlayLayers = await getWebglLayerPolicyState(page, ["texture", "terrain"]);
    for (const layer of overlayLayers) {
      expect(layer, layer.id).toMatchObject({
        display: "inline",
        hasManagedClass: false,
        hasOverlayClass: true
      });
      expect(layer.childCount).toBeGreaterThan(0);
    }

    const stats = await waitForWebglCanvasPixels(page);
    expect(stats.coloredPixels).toBeGreaterThan(500);
  });

  test("restores SVG layer visibility and clears deck layers after switching back to svg", async ({ page }) => {
    await page.goto("/?seed=webgl-svg-roundtrip&width=1000&height=700");
    await waitForMapLoad(page);

    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);
    await expect.poll(() => getWebglRendererDomState(page)).toMatchObject({
      bodyHasHybridClass: true,
      canvasDisplay: "block",
      deckExists: true,
      landmassHasManagedClass: true,
      landmassDisplay: "none",
      scaleBarHasOverlayClass: true
    });

    await setRenderMode(page, "svg");
    await expect.poll(() => getWebglDeckLayerIds(page), { timeout: 5000 }).toEqual([]);
    await expect.poll(() => getWebglRendererDomState(page)).toMatchObject({
      bodyHasHybridClass: false,
      canvasDisplay: "none",
      deckExists: false,
      landmassHasManagedClass: true,
      landmassDisplay: "inline",
      scaleBarHasOverlayClass: true
    });
    await expect(page.locator("#landmass")).toBeVisible();
    await expect(page.locator("#scaleBar")).toBeVisible();
  });

  test("keeps labels hidden after switching from WebGL to SVG", async ({ page }) => {
    await page.goto("/?seed=webgl-svg-label-visibility&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);

    await page.locator("#optionsHide").click();
    await page.locator("#layersTab").click();
    await page.locator("#layersPreset").selectOption("political");
    await expect(page.locator("#labels text").first()).toBeAttached();
    await page.getByRole("button", { name: "Labels", exact: true }).click();

    await expect(page.locator("#toggleLabels")).toHaveClass(/buttonoff/);
    await expect
      .poll(() => getWebglDeckLayerIds(page), { timeout: 5000 })
      .not.toContain("fmg-webgl-labels");

    await page.getByRole("switch", { name: "WebGL rendering" }).uncheck();

    await expect(page.locator("#labels")).toBeHidden();
    await expect.poll(() => getWebglDeckLayerIds(page), { timeout: 5000 }).toEqual([]);
  });

  test("recreates deck renderer and redraws canvas after loading a map", async ({ page }) => {
    await page.goto("/?seed=webgl-load-before&width=1000&height=700");
    await waitForMapLoad(page);

    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);
    await markCurrentWebglDeck(page);

    await uploadMapFixture(page, "demo.map");
    await expect(page.locator("#webglMapCanvas")).toBeVisible();
    const stats = await waitForWebglCanvasPixels(page);
    expect(stats.coloredPixels).toBeGreaterThan(500);
    await expect.poll(() => getWebglDeckLayerIds(page), { timeout: 5000 }).toContain("fmg-webgl-background");
    await expect.poll(() => getWebglRendererDomState(page)).toMatchObject({
      bodyHasHybridClass: true,
      deckExists: true,
      deckHasTestMarker: false,
      deckCanvasMatchesDom: true,
      viewCanvasMatchesDom: true
    });
  });

  test("reacquires Economy SVG layers without disturbing the hybrid host layer policy after map load", async ({ page }) => {
    await page.goto("/?seed=webgl-extension-map-load&width=1000&height=700");
    await waitForMapLoad(page);

    await page.locator("#optionsHide").click();
    await page.locator("#extensionsTab").click();
    const charactersToggle = page.getByRole("checkbox", { name: "Toggle Characters extension" });
    await expect(charactersToggle).not.toBeChecked();
    await charactersToggle.check();
    await expect(charactersToggle).toBeChecked();

    const economyToggle = page.getByRole("checkbox", { name: "Toggle Economy, Goods & Trade extension" });
    await expect(economyToggle).not.toBeChecked();
    await expect(economyToggle).toBeEnabled();
    await economyToggle.check();
    await expect(economyToggle).toBeChecked();

    const extensionLayerIds = ["goods", "marketsLayerFill", "marketsLayer", "tradeAnimation"] as const;
    for (const id of extensionLayerIds) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
    await page.locator("#goods").evaluate(element => element.setAttribute("data-phase7-preload", "true"));

    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);
    await page.locator("#layersTab").click();
    await page.getByRole("button", { name: "Goods", exact: true }).click();
    await page.getByRole("button", { name: "Markets", exact: true }).click();
    await expect
      .poll(() => getWebglDeckLayerIds(page), { timeout: 5000 })
      .toEqual(
        expect.arrayContaining([
          "fmg-webgl-extension-economy-goods-cells",
          "fmg-webgl-extension-economy-goods-sources",
          "fmg-webgl-extension-economy-market-areas",
          "fmg-webgl-extension-economy-market-centers"
        ])
      );
    await expect(page.locator("#goods")).toBeHidden();
    await expect(page.locator("#marketsLayer")).toBeHidden();
    const economyLayerData = await getWebglLayerStyleSamples(page, [
      "fmg-webgl-extension-economy-goods-cells",
      "fmg-webgl-extension-economy-goods-sources",
      "fmg-webgl-extension-economy-market-areas",
      "fmg-webgl-extension-economy-market-centers"
    ]);
    for (const layer of economyLayerData) {
      expect(layer.dataCount, layer.layerId).toBeGreaterThan(0);
    }
    await uploadMapFixture(page, "demo.map");

    const stats = await waitForWebglCanvasPixels(page);
    expect(stats.coloredPixels).toBeGreaterThan(500);
    for (const id of extensionLayerIds) {
      const layer = page.locator(`#${id}`);
      await expect(layer).toBeAttached();
      await expect(layer).not.toHaveAttribute("data-phase7-preload");
      await expect(layer).not.toHaveClass(/fmg-webgl-managed-svg-layer/);
    }
    await expect
      .poll(() => getWebglDeckLayerIds(page), { timeout: 5000 })
      .toEqual(
        expect.arrayContaining([
          "fmg-webgl-extension-economy-goods-cells",
          "fmg-webgl-extension-economy-goods-sources",
          "fmg-webgl-extension-economy-market-areas",
          "fmg-webgl-extension-economy-market-centers"
        ])
      );
    await expect
      .poll(() => page.locator("#goods").evaluate(element => element.parentElement?.id ?? ""))
      .toBe("viewbox");
    await expect.poll(() => getWebglRendererDomState(page)).toMatchObject({
      bodyHasHybridClass: true,
      landmassHasManagedClass: true,
      landmassDisplay: "none",
      deckCanvasMatchesDom: true,
      viewCanvasMatchesDom: true
    });
  });

  test("lists Economy goods and markets in the WebGL map pick chooser", async ({ page }) => {
    await page.goto("/?seed=webgl-economy-pick-chooser&width=1000&height=700");
    await waitForMapLoad(page);

    await page.locator("#optionsHide").click();
    await page.locator("#extensionsTab").click();
    await page.getByRole("checkbox", { name: "Toggle Characters extension" }).check();
    await page.getByRole("checkbox", { name: "Toggle Economy, Goods & Trade extension" }).check();

    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);
    await page.locator("#layersTab").click();
    await page.getByRole("button", { name: "Goods", exact: true }).click();
    await page.getByRole("button", { name: "Markets", exact: true }).click();

    const cases = [
      {
        layerId: "fmg-webgl-extension-economy-goods-cells",
        label: /^Good:/,
        dialogSelector: "#goodsEditorContainer"
      },
      {
        layerId: "fmg-webgl-extension-economy-market-areas",
        label: /^Market:/,
        dialogSelector: "#marketOverviewContainer"
      }
    ];

    for (const item of cases) {
      const point = await getFirstWebglLayerDatumClickPoint(page, item.layerId);
      expect(point, item.layerId).not.toBeNull();
      if (!point) return;

      const pick = await clickAndGetWebglPickCandidates(page, point);
      const candidate = pick.candidates.find(
        value => value.kind === "extension" && value.layerId === item.layerId && value.id === point.id
      );
      expect(candidate, item.layerId).toBeDefined();
      if (!candidate) return;

      const chooserItem = page
        .locator(`#mapPickChooser .map-pick-chooser__item[data-kind="extension"][data-pick-id="${candidate.id}"]`)
        .first();
      await expect(chooserItem).toBeVisible();
      await expect(chooserItem.locator(".map-pick-chooser__title")).toHaveText(item.label);
      await chooserItem.click();
      await expect(page.locator(item.dialogSelector)).toBeVisible();
      await closeAllOpenEditorDialogs(page);
    }
  });

  test("emits stable pick detail without taking over editor clicks", async ({ page }) => {
    await page.goto("/?seed=webgl-pick&width=900&height=600");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);

    const pickPromise = page.evaluate(
      () =>
        new Promise<{
          kind: string;
          id: string;
          cellId: number | null;
          layerId: string;
        } | null>(resolve => {
          document.addEventListener(
            "fmg:webgl-map-pick",
            event => resolve((event as CustomEvent<Parameters<typeof resolve>[0]>).detail),
            { once: true }
          );
        })
    );

    const point = await getFirstLandScreenPoint(page);
    await page.mouse.click(point.x, point.y);
    const pick = await pickPromise;

    expect(pick).toMatchObject({
      kind: expect.any(String),
      id: expect.any(String),
      layerId: expect.stringMatching(/^fmg-webgl-/)
    });
    await expect(page.locator("#debug .webgl-selected")).toHaveCount(1);
    await expect(getWebglCanvasPixelStats(page)).resolves.toMatchObject({
      coloredPixels: expect.any(Number),
      nonTransparentPixels: expect.any(Number),
      alphaBoundingArea: expect.any(Number)
    });
  });

  test("reports pick detail for WebGL migrated edit targets", async ({ page }) => {
    await page.goto("/?seed=webgl-pick-targets&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);

    for (const toggleId of [
      "toggleStates",
      "toggleProvinces",
      "toggleLakes",
      "toggleBurgIcons",
      "toggleMarkers",
      "toggleMilitary",
      "toggleRivers",
      "toggleRoutes"
    ]) {
      await ensureLayerOn(page, toggleId);
    }

    const pickCases = [
      { layerId: "fmg-webgl-states", kind: "state", requiresCell: true },
      { layerId: "fmg-webgl-provinces", kind: "province", requiresCell: true },
      { layerId: "fmg-webgl-lakes", kind: "lake", requiresCell: true },
      { layerId: "fmg-webgl-military", kind: "military", requiresCell: true },
      { layerId: "fmg-webgl-rivers", kind: "river", requiresCell: false },
      { layerId: "fmg-webgl-routes", kind: "route", requiresCell: false }
    ];
    const dataIdentityCases = [
      { layerId: "fmg-webgl-burg-icons", kind: "burgIcon" },
      { layerId: "fmg-webgl-markers", kind: "marker" }
    ];

    await expect
      .poll(() => getWebglDeckLayerIds(page), { timeout: 5000 })
      .toEqual(expect.arrayContaining([...pickCases, ...dataIdentityCases].map(item => item.layerId)));

    for (const item of pickCases) {
      const pick = await pickFirstWebglLayerDatum(page, item.layerId);
      expect(pick, item.layerId).toMatchObject({
        requestedLayerId: item.layerId,
        layerId: item.layerId,
        kind: item.kind,
        id: expect.any(String),
        index: expect.any(Number),
        x: expect.any(Number),
        y: expect.any(Number)
      });
      expect(pick?.id.length, item.layerId).toBeGreaterThan(0);
      expect(pick?.coordinate?.[0], item.layerId).toEqual(expect.any(Number));
      expect(pick?.coordinate?.[1], item.layerId).toEqual(expect.any(Number));
      if (item.requiresCell) expect(pick?.cellId, item.layerId).toEqual(expect.any(Number));
    }

    for (const item of dataIdentityCases) {
      const datum = await getFirstWebglLayerDatumIdentity(page, item.layerId);
      expect(datum, item.layerId).toMatchObject({
        layerId: item.layerId,
        kind: item.kind,
        id: expect.any(String),
        cellId: expect.any(Number)
      });
      expect(datum?.id.length, item.layerId).toBeGreaterThan(0);
    }

    const markerPoint = await forceWebglMarkerFixture(page);
    const markerCandidates = await clickAndGetWebglPickCandidates(page, markerPoint);
    expect(markerCandidates.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layerId: "fmg-webgl-markers",
          kind: "marker",
          id: `marker-${markerPoint.markerId}`,
          cellId: expect.any(Number),
          coordinate: expect.arrayContaining([expect.any(Number), expect.any(Number)])
        })
      ])
    );
    await closeAllOpenEditorDialogs(page);

    const burgPoint = await getFirstWebglLayerDatumClickPoint(page, "fmg-webgl-burg-icons");
    expect(burgPoint).not.toBeNull();
    if (!burgPoint) return;

    const burgCandidates = await clickAndGetWebglPickCandidates(page, burgPoint);
    expect(burgCandidates.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layerId: "fmg-webgl-burg-icons",
          kind: "burgIcon",
          id: burgPoint.id,
          cellId: expect.any(Number),
          coordinate: expect.arrayContaining([expect.any(Number), expect.any(Number)])
        })
      ])
    );
  });

  test("opens existing editors from WebGL pick targets", async ({ page }) => {
    await page.goto("/?seed=webgl-click-edit&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);

    for (const toggleId of ["toggleBurgIcons", "toggleMarkers", "toggleRivers", "toggleRoutes"]) {
      await ensureLayerOn(page, toggleId);
    }

    for (const target of [
      { layerId: "fmg-webgl-burg-icons", kind: "burgIcon", editorSelector: "#burgBody" },
      { layerId: "fmg-webgl-markers", kind: "marker", editorSelector: "#markerBody" },
      { layerId: "fmg-webgl-rivers", kind: "river", editorSelector: "#riverBody" },
      { layerId: "fmg-webgl-routes", kind: "route", editorSelector: "#routeEditor" },
      { layerId: "fmg-webgl-coastline", kind: "coastline", editorSelector: "#coastlineGroupsShow" }
    ]) {
      await clickWebglEditTargetAndExpectEditor(page, target);
    }
  });

  test("drags the selected WebGL marker without panning the map", async ({ page }) => {
    await page.goto("/?seed=webgl-marker-drag&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);
    await ensureLayerOn(page, "toggleMarkers");
    const fixture = await forceWebglMarkerFixture(page);
    await waitForWebglCanvasPixels(page);

    // Dragging is only wired up for the marker whose editor is already open (mirrors the SVG
    // flow, where MarkersEditor.editMarker() attaches d3-drag only after the marker is selected).
    const pickResult = await clickAndGetWebglPickCandidates(page, fixture);
    const candidateId = `marker-${fixture.markerId}`;
    const candidate =
      pickResult.candidates.find(item => item.kind === "marker" && item.id === candidateId) ??
      pickResult.candidates.find(item => item.kind === "marker");
    expect(candidate).toMatchObject({ kind: "marker", id: candidateId });
    if (!candidate) return;

    const chooserItem = page
      .locator(`#mapPickChooser .map-pick-chooser__item[data-kind="marker"][data-pick-id="${candidate.id}"]`)
      .first();
    try {
      await expect(chooserItem).toBeVisible({ timeout: 700 });
      await chooserItem.click();
    } catch {
      // Single-candidate clicks dispatch the same selected event without showing the chooser.
    }
    await expect(page.locator("#markerBody")).toBeVisible();

    const before = await getMarkerPosition(page, fixture.markerId);
    expect(before).not.toBeNull();
    const viewBefore = await getViewTransformState(page);

    const dragTarget = { x: fixture.x + 60, y: fixture.y - 40 };
    await page.mouse.move(fixture.x, fixture.y);
    await page.mouse.down();
    await page.mouse.move(dragTarget.x, dragTarget.y, { steps: 5 });
    await page.mouse.up();

    const viewAfter = await getViewTransformState(page);
    expect(viewAfter).toEqual(viewBefore);

    const after = await getMarkerPosition(page, fixture.markerId);
    expect(after).not.toBeNull();
    if (!before || !after) return;

    const expectedDx = (dragTarget.x - fixture.x) / viewBefore.scale;
    const expectedDy = (dragTarget.y - fixture.y) / viewBefore.scale;
    expect(after.x - before.x).toBeCloseTo(expectedDx, 0);
    expect(after.y - before.y).toBeCloseTo(expectedDy, 0);
  });

  test("drags the selected WebGL glacier and iceberg without panning the map", async ({ page }) => {
    await page.goto("/?seed=webgl-ice-drag&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);
    await ensureLayerOn(page, "toggleIce");

    const glacier = await forceWebglGlacierFixture(page);
    const iceberg = await forceWebglIcebergFixture(page);
    await waitForWebglCanvasPixels(page);

    for (const fixture of [
      { id: glacier.glacierId, pickId: `glacier-${glacier.glacierId}`, x: glacier.x, y: glacier.y },
      { id: iceberg.icebergId, pickId: `iceberg-${iceberg.icebergId}`, x: iceberg.x, y: iceberg.y }
    ]) {
      const pickResult = await clickAndGetWebglPickCandidates(page, fixture);
      const candidate = pickResult.candidates.find(item => item.kind === "ice" && item.id === fixture.pickId);
      expect(candidate).toMatchObject({ kind: "ice", id: fixture.pickId });
      if (!candidate) return;

      const chooserItem = page
        .locator(`#mapPickChooser .map-pick-chooser__item[data-kind="ice"][data-pick-id="${fixture.pickId}"]`)
        .first();
      try {
        await expect(chooserItem).toBeVisible({ timeout: 700 });
        await chooserItem.click();
      } catch {
        // Single-candidate clicks dispatch the same selected event without showing the chooser.
      }
      await expect(page.locator("#iceEditStyle")).toBeVisible();

      const before = await getIceOffset(page, fixture.id);
      expect(before).not.toBeNull();
      if (!before) return;
      const viewBefore = await getViewTransformState(page);
      const dragTarget = { x: fixture.x + 60, y: fixture.y - 40 };

      await page.mouse.move(fixture.x, fixture.y);
      await page.mouse.down();
      await page.mouse.move(dragTarget.x, dragTarget.y, { steps: 5 });
      await page.mouse.up();

      expect(await getViewTransformState(page)).toEqual(viewBefore);
      const after = await getIceOffset(page, fixture.id);
      expect(after).not.toBeNull();
      if (!after) return;

      const expectedDx = (dragTarget.x - fixture.x) / viewBefore.scale;
      const expectedDy = (dragTarget.y - fixture.y) / viewBefore.scale;
      expect(after[0] - before[0]).toBeCloseTo(expectedDx, 0);
      expect(after[1] - before[1]).toBeCloseTo(expectedDy, 0);
    }
  });

  test("hover tooltip names the same state cell in SVG and WebGL mode", async ({ page }) => {
    await page.goto("/?seed=webgl-tooltip-parity&width=1000&height=700");
    await waitForMapLoad(page);
    await ensureLayerOn(page, "toggleStates");

    const point = await getFirstStateScreenPoint(page);
    expect(point).not.toBeNull();
    if (!point) return;

    // The SVG hover handler (src/services/mapInteraction.ts onMouseMove) fires on the leading edge
    // of a 100ms cooldown, so two moves issued back-to-back would have the second one (the actual
    // target) swallowed by the first move's cooldown — space them out instead of moving away first.
    await page.mouse.move(point.x - 50, point.y - 50);
    await page.waitForTimeout(150);
    await page.mouse.move(point.x, point.y);
    await expect.poll(() => getToastText(page), { timeout: 2000 }).not.toBe("");
    const svgTooltip = await getToastText(page);
    expect(svgTooltip).toContain(point.stateName);

    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);
    await page.mouse.move(point.x - 50, point.y - 50);
    await page.waitForTimeout(150);
    await page.mouse.move(point.x, point.y);
    await expect.poll(() => getToastText(page), { timeout: 2000 }).toBe(svgTooltip);
    const webglTooltip = await getToastText(page);

    // Both hover paths now share getCellPoliticalSummary() (src/services/cellInfoService.ts), so
    // SVG and WebGL hover text for a state (+ province, if any) cell is expected to match exactly,
    // not just name the same state.
    expect(webglTooltip).toBe(svgTooltip);
  });

  test("opens the Lake Editor from a WebGL pick target", async ({ page }) => {
    // This seed is known to generate at least one lake (see "reports pick detail" above).
    await page.goto("/?seed=webgl-pick-targets&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);
    await ensureLayerOn(page, "toggleLakes");

    await clickWebglEditTargetAndExpectEditor(page, {
      layerId: "fmg-webgl-lakes",
      kind: "lake",
      editorSelector: "#lakeBody"
    });
  });

  test("opens the Ice Editor from a WebGL pick target", async ({ page }) => {
    // Ice generation is seed/latitude dependent, so a glacier is forced at the map center.
    await page.goto("/?seed=webgl-ice-click-edit&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);
    await ensureLayerOn(page, "toggleIce");

    const point = await forceWebglGlacierFixture(page);
    const pickResult = await clickAndGetWebglPickCandidates(page, point);
    const candidate = pickResult.candidates.find(item => item.kind === "ice" && item.id === `glacier-${point.glacierId}`);
    expect(candidate).toMatchObject({ kind: "ice", id: `glacier-${point.glacierId}` });

    const chooserItem = page
      .locator(`#mapPickChooser .map-pick-chooser__item[data-kind="ice"][data-pick-id="glacier-${point.glacierId}"]`)
      .first();
    try {
      await expect(chooserItem).toBeVisible({ timeout: 700 });
      await chooserItem.click();
    } catch {
      // Single-candidate clicks dispatch the same selected event without showing the chooser.
    }

    await expect(page.locator("#iceEditStyle")).toBeVisible();
  });

  test("shows a chooser when multiple WebGL edit targets overlap", async ({ page }) => {
    await page.goto("/?seed=webgl-overlap-picker&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);
    await ensureLayerOn(page, "toggleMilitary");
    await ensureLayerOn(page, "toggleBurgIcons");

    const point = await forceOverlappingWebglRegiments(page);
    const pick = await clickAndGetWebglPickCandidates(page, point);

    expect(pick.candidates.length).toBeGreaterThanOrEqual(2);
    expect(pick.primary).toEqual(pick.candidates[0]);
    if (pick.legacyPick) expect(pick.primary).toEqual(pick.legacyPick);
    expect(pick.clientX).toBeCloseTo(point.x, 0);
    expect(pick.clientY).toBeCloseTo(point.y, 0);

    const candidateKeys = pick.candidates.map(candidate => `${candidate.layerId}:${candidate.id}`);
    expect(new Set(candidateKeys).size).toBe(candidateKeys.length);
    expect(pick.candidates.filter(candidate => candidate.kind === "military").length).toBeGreaterThanOrEqual(2);
    expect(pick.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "burgIcon",
          id: `burg-${point.burgId}`,
          layerId: "fmg-webgl-burg-icons"
        })
      ])
    );

    const chooser = page.locator("#mapPickChooser");
    await expect(chooser).toBeVisible();
    await expect(page.locator("#regimentEditorContainer")).toBeHidden();

    const regimentItems = chooser.locator(".map-pick-chooser__item[data-kind='military']");
    await expect.poll(() => regimentItems.count(), { timeout: 5000 }).toBeGreaterThanOrEqual(2);

    const selectedPromise = page.evaluate(
      () =>
        new Promise<{ kind: string; id: string }>(resolve => {
          document.addEventListener(
            "fmg:webgl-map-pick-candidate-selected",
            event => resolve((event as CustomEvent<{ kind: string; id: string }>).detail),
            { once: true }
          );
        })
    );
    await regimentItems.nth(1).click();
    const selected = await selectedPromise;

    await expect(chooser).toBeHidden();
    await expect(page.locator("#regimentEditorContainer")).toBeVisible();
    await expect(page.locator("#debug .webgl-selected")).toHaveCount(1);
    expect(selected).toMatchObject({ kind: "military", id: expect.stringMatching(/^regiment-/) });
  });

  test("omits display-only WebGL layers from the map pick chooser", async ({ page }) => {
    await page.goto("/?seed=webgl-chooser-display-only-layers&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");

    await page.evaluate(() => {
      const hiddenKinds = [
        "background",
        "land",
        "height",
        "biome",
        "culture",
        "religion",
        "state",
        "province",
        "zone",
        "temperature",
        "population",
        "precipitation",
        "danger",
        "cell",
        "grid",
        "border"
      ];
      const candidates = [
        ...hiddenKinds.map((kind, index) => ({
          kind,
          extensionId: null,
          id: `${kind}-${index}`,
          cellId: index,
          layerId: `fmg-webgl-${kind}`,
          index,
          x: 120,
          y: 120,
          coordinate: [100, 100]
        })),
        {
          kind: "burgIcon",
          extensionId: null,
          id: "burg-1",
          cellId: 1,
          layerId: "fmg-webgl-burg-icons",
          index: 0,
          x: 120,
          y: 120,
          coordinate: [100, 100]
        },
        {
          kind: "emblem",
          extensionId: null,
          id: "state-1",
          cellId: 1,
          layerId: "fmg-webgl-emblems",
          index: 0,
          x: 120,
          y: 120,
          coordinate: [100, 100]
        },
        {
          kind: "label",
          extensionId: null,
          id: "burg-label-1",
          cellId: 1,
          layerId: "fmg-webgl-labels",
          index: 0,
          x: 120,
          y: 120,
          coordinate: [100, 100]
        }
      ];
      document.dispatchEvent(
        new CustomEvent("fmg:webgl-map-pick-candidates", {
          detail: { primary: candidates[0], candidates, x: 120, y: 120, clientX: 120, clientY: 120 }
        })
      );
    });

    const chooser = page.locator("#mapPickChooser");
    await expect(chooser).toBeVisible();
    await expect(chooser.locator(".map-pick-chooser__item")).toHaveCount(3);
    await expect(chooser.locator('.map-pick-chooser__item[data-kind="burgIcon"]')).toHaveCount(1);
    await expect(chooser.locator('.map-pick-chooser__item[data-kind="emblem"]')).toHaveCount(1);
    await expect(chooser.locator('.map-pick-chooser__item[data-kind="label"]')).toHaveCount(1);
  });

  test("opens the matching editor from WebGL emblem and burg label picks", async ({ page }) => {
    await page.goto("/?seed=webgl-emblem-and-label-picks&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");

    await page.evaluate(() => {
      const detail = {
        kind: "label",
        extensionId: null,
        id: "burg-label-1",
        cellId: 1,
        layerId: "fmg-webgl-labels",
        index: 0,
        x: 120,
        y: 120,
        coordinate: [100, 100]
      };
      document.dispatchEvent(
        new CustomEvent("fmg:webgl-map-pick-candidates", {
          detail: { primary: detail, candidates: [detail], x: 120, y: 120, clientX: 120, clientY: 120 }
        })
      );
    });
    await expect(page.locator("#burgBody")).toBeVisible();

    await closeAllOpenEditorDialogs(page);
    await page.evaluate(() => {
      const detail = {
        kind: "emblem",
        extensionId: null,
        id: "state-1",
        cellId: 1,
        layerId: "fmg-webgl-emblems",
        index: 0,
        x: 120,
        y: 120,
        coordinate: [100, 100]
      };
      document.dispatchEvent(
        new CustomEvent("fmg:webgl-map-pick-candidates", {
          detail: { primary: detail, candidates: [detail], x: 120, y: 120, clientX: 120, clientY: 120 }
        })
      );
    });
    await expect(page.locator("#emblemEditor")).toBeVisible();
  });

  test("renders migrated layers for major presets while keeping SVG overlays", async ({ page }) => {
    await page.goto("/?seed=webgl-presets&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await waitForWebglCanvasPixels(page);

    const presets = [
      {
        name: "political",
        layers: ["fmg-webgl-states", "fmg-webgl-states-boundaries", "fmg-webgl-borders", "fmg-webgl-labels"]
      },
      {
        name: "cultural",
        layers: ["fmg-webgl-cultures", "fmg-webgl-cultures-boundaries", "fmg-webgl-borders", "fmg-webgl-labels"]
      },
      {
        name: "religions",
        layers: ["fmg-webgl-religions", "fmg-webgl-religions-boundaries", "fmg-webgl-borders", "fmg-webgl-labels"]
      },
      { name: "provinces", layers: ["fmg-webgl-provinces", "fmg-webgl-provinces-boundaries", "fmg-webgl-borders"] },
      { name: "biomes", layers: ["fmg-webgl-biomes", "fmg-webgl-rivers"] },
      { name: "physical", layers: ["fmg-webgl-height", "fmg-webgl-rivers"] },
      { name: "poi", layers: ["fmg-webgl-height", "fmg-webgl-markers", "fmg-webgl-marker-icons"] },
      {
        name: "military",
        layers: [
          "fmg-webgl-states",
          "fmg-webgl-states-boundaries",
          "fmg-webgl-borders",
          "fmg-webgl-military",
          "fmg-webgl-military-totals",
          "fmg-webgl-labels"
        ]
      },
      {
        name: "emblems",
        layers: ["fmg-webgl-emblems", "fmg-webgl-states", "fmg-webgl-states-boundaries", "fmg-webgl-borders"]
      }
    ];

    for (const preset of presets) {
      await setLayerPreset(page, preset.name);
      await expect
        .poll(() => getWebglDeckLayerIds(page), { timeout: 5000 })
        .toEqual(
          expect.arrayContaining([
            "fmg-webgl-background",
            "fmg-webgl-land",
            "fmg-webgl-lakes",
            "fmg-webgl-lakes-outlines",
            "fmg-webgl-coastline",
            ...preset.layers
          ])
        );
      const stats = await waitForWebglCanvasPixels(page);
      expect(stats.coloredPixels).toBeGreaterThan(500);
      expect(stats.nonTransparentPixels).toBeGreaterThan(500);
      expect(stats.alphaBoundingArea).toBeGreaterThan(500);
      await expect(page.locator("#webglMapCanvas")).toBeVisible();
      await expect(page.locator("#landmass")).toBeHidden();
      await expect(page.locator("#borders")).toBeHidden();
      await expect(page.locator("#lakes")).toBeHidden();
      await expect(page.locator("#coastline")).toBeHidden();
      await expect(page.locator("#ice")).toBeHidden();
      await expect(page.locator("#terrain")).toBeHidden();
      await expect(page.locator("#emblems")).toBeHidden();
      await expect(page.locator("#icons")).toBeHidden();
      await expect(page.locator("#labels")).toBeHidden();
      await expect(page.locator("#markers")).toBeHidden();
      await expect(page.locator("#armies")).toBeHidden();
      await expect(page.locator("#scaleBar")).toBeVisible();
    }
  });

  test("rasterizes real coa artwork for state/province emblems but keeps burgs on the placeholder shield", async ({
    page
  }) => {
    await page.goto("/?seed=webgl-emblem-coa&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await setLayerPreset(page, "emblems");
    await waitForWebglCanvasPixels(page);

    await expect.poll(async () => (await getWebglEmblemIconSummary(page)).total, { timeout: 5000 }).toBeGreaterThan(
      0
    );

    // Coa rasterization is async (emblemIconCache.ts); poll until at least one state/province
    // icon resolves and triggers the redraw that picks it up.
    await expect
      .poll(async () => (await getWebglEmblemIconSummary(page)).stateOrProvinceWithIconUrl, { timeout: 10000 })
      .toBeGreaterThan(0);

    const summary = await getWebglEmblemIconSummary(page);
    expect(summary.burgWithIconUrl).toBe(0);
  });

  test("rasterizes distinct data-icon glyph shapes for burg groups using the atlas style preset", async ({
    page
  }) => {
    await page.goto("/?seed=webgl-burg-icon-atlas&width=1000&height=700");
    await waitForMapLoad(page);
    await setLayerPreset(page, "political");
    await applyStylePreset(page, "atlas");
    await waitForWebglCanvasPixels(page);

    // atlas.json assigns distinct data-icon glyphs (circle/square/triangle/cross) per burg group,
    // none of which have their own fill — rasterization is async (burgIconRasterCache.ts), so poll
    // until more than one distinct icon shape has resolved.
    await expect
      .poll(async () => (await getWebglBurgIconSummary(page)).distinctIconUrls, { timeout: 10000 })
      .toBeGreaterThan(1);

    const summary = await getWebglBurgIconSummary(page);
    expect(summary.unmaskedCount).toBe(0);
    expect(summary.maskedCount).toBe(summary.withIconUrl);
  });

  test("rasterizes multi-color data-icon pictures for burg groups using the ancient style preset", async ({
    page
  }) => {
    await page.goto("/?seed=webgl-burg-icon-ancient&width=1000&height=700");
    await waitForMapLoad(page);
    await setLayerPreset(page, "political");
    await applyStylePreset(page, "ancient");
    await waitForWebglCanvasPixels(page);

    // ancient.json assigns #icon-watabou-* pictures per burg group, all of which bake in their
    // own fill colors — these must render unmasked (own colors), not tinted via getColor.
    await expect
      .poll(async () => (await getWebglBurgIconSummary(page)).unmaskedCount, { timeout: 10000 })
      .toBeGreaterThan(0);
  });

  test("falls back to no icon after a marker's external image fails to load", async ({ page }) => {
    await page.goto("/?seed=webgl-marker-icon-failure&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await ensureLayerOn(page, "toggleMarkers");
    await waitForWebglCanvasPixels(page);

    const markerId = await page.evaluate(() => {
      type TestMarker = { i: number; type: string; icon: string; cell: number; x: number; y: number; size: number };
      type TestPack = { markers: TestMarker[] };
      const pack = window.fmg.world.pack as unknown as TestPack;
      const id = pack.markers.reduce((max, item) => Math.max(max, item.i), 0) + 1;
      const cx = window.fmg.world.graphWidth / 2;
      const cy = window.fmg.world.graphHeight / 2;
      const url = `${window.location.origin}/definitely-missing-marker-icon-404.png`;
      pack.markers.push({ i: id, type: "marker-icon-failure-fixture", icon: url, cell: 0, x: cx, y: cy, size: 30 });
      return id;
    });
    await page.evaluate(() => window.fmg.actions.setRenderMode("webglHybrid"));

    await expect
      .poll(async () => (await getWebglMarkerIconState(page, markerId))?.isExternalIcon, { timeout: 5000 })
      .toBe(true);

    // The failed load is detected via IconLayer's onIconError (externalIconFailureCache.ts), which
    // triggers a rebuild that falls the marker back to no icon instead of leaving it broken.
    await expect
      .poll(async () => (await getWebglMarkerIconState(page, markerId))?.isExternalIcon, { timeout: 10000 })
      .toBe(false);
    expect((await getWebglMarkerIconState(page, markerId))?.icon).toBe("");
  });

  test("sets label font/halo from style and approximates state label rotation", async ({ page }) => {
    await page.goto("/?seed=webgl-label-style&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await setLayerPreset(page, "political");
    await waitForWebglCanvasPixels(page);

    const defaultSettings = await getWebglLabelLayerSettings(page);
    expect(defaultSettings.exists).toBe(true);
    expect(defaultSettings.fontFamily).toBe("Almendra SC");
    expect(defaultSettings.sdf).toBe(true);
    expect(defaultSettings.outlineWidth).toBeGreaterThan(0);
    expect(defaultSettings.outlineColor).toEqual([255, 255, 255, 255]);
    // A curved textPath (SVG) can't be reproduced by TextLayer's straight baseline (Phase 6.3
    // acceptance) — this checks the accepted approximation instead: at least one state's flat
    // label is rotated to follow the state's general orientation rather than staying horizontal.
    expect(defaultSettings.stateCount).toBeGreaterThan(0);
    expect(defaultSettings.nonZeroAngleStateCount).toBeGreaterThan(0);

    await applyStylePreset(page, "night");
    await waitForWebglCanvasPixels(page);
    const nightSettings = await getWebglLabelLayerSettings(page);
    expect(nightSettings.fontFamily).toBe("Courier New");
    expect(nightSettings.outlineColor).toEqual([0, 0, 0, 255]);
  });

  test("keeps WebGL style data populated across representative style presets", async ({ page }) => {
    await page.goto("/?seed=webgl-style-fidelity&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await setLayerPreset(page, "political");
    await waitForWebglCanvasPixels(page);

    const styleSignatures = new Set<string>();
    for (const preset of ["default", "atlas", "watercolor", "night", "cyberpunk"]) {
      await applyStylePreset(page, preset);
      await waitForWebglCanvasPixels(page);
      await expect
        .poll(() => getWebglDeckLayerIds(page), { timeout: 5000 })
        .toEqual(
          expect.arrayContaining([
            "fmg-webgl-background",
            "fmg-webgl-land",
            "fmg-webgl-lakes",
            "fmg-webgl-lakes-outlines",
            "fmg-webgl-coastline",
            "fmg-webgl-states",
            "fmg-webgl-labels"
          ])
        );

      const samples = await getWebglLayerStyleSamples(page, [
        "fmg-webgl-land",
        "fmg-webgl-lakes",
        "fmg-webgl-lakes-outlines",
        "fmg-webgl-coastline",
        "fmg-webgl-labels"
      ]);
      for (const sample of samples) expect(sample.dataCount, `${preset}:${sample.layerId}`).toBeGreaterThan(0);
      expect(samples.find(sample => sample.layerId === "fmg-webgl-land")?.fillColor).toEqual(
        expect.arrayContaining([expect.any(Number)])
      );
      expect(samples.find(sample => sample.layerId === "fmg-webgl-lakes-outlines")?.width).toEqual(
        expect.any(Number)
      );
      expect(samples.find(sample => sample.layerId === "fmg-webgl-coastline")?.color).toEqual(
        expect.arrayContaining([expect.any(Number)])
      );
      expect(samples.find(sample => sample.layerId === "fmg-webgl-labels")?.size).toEqual(expect.any(Number));

      const comparisons = await getWebglStyleComparisons(page);
      expect(comparisons.length, preset).toBeGreaterThan(3);
      for (const comparison of comparisons) {
        for (let index = 0; index < comparison.svgColor.length; index++) {
          expect(
            Math.abs((comparison.deckColor[index] ?? 0) - (comparison.svgColor[index] ?? 0)),
            `${preset}:${comparison.source}:${comparison.group}:color[${index}]`
          ).toBeLessThanOrEqual(1);
        }
        if (comparison.svgWidth !== null && comparison.deckWidth !== null) {
          expect(
            Math.abs(comparison.deckWidth - comparison.svgWidth),
            `${preset}:${comparison.source}:${comparison.group}:width`
          ).toBeLessThanOrEqual(0.001);
        }
        if (comparison.svgSize !== null && comparison.deckSize !== null) {
          expect(
            Math.abs(comparison.deckSize - comparison.svgSize),
            `${preset}:${comparison.source}:${comparison.group}:size`
          ).toBeLessThanOrEqual(0.001);
        }
      }
      styleSignatures.add(JSON.stringify(samples));
    }

    expect(styleSignatures.size).toBeGreaterThan(1);
  });
});

test.describe("webgl hybrid renderer on HiDPI", () => {
  test.use({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });

  test("keeps canvas density and representative style units stable on desktop and mobile", async ({ page }) => {
    await page.goto("/?seed=webgl-hidpi-style&width=1000&height=700");
    await waitForMapLoad(page);
    await setRenderMode(page, "webglHybrid");
    await setLayerPreset(page, "political");
    await ensureLayerOn(page, "toggleBurgIcons");
    await waitForWebglCanvasPixels(page);

    const desktopStats = await getWebglCanvasPixelStats(page);
    expect(desktopStats.width).toBe(2000);
    expect(desktopStats.height).toBe(1400);
    expect(desktopStats.coloredPixels).toBeGreaterThan(500);

    await expect.poll(() => getWebglLayerRenderingProps(page, [
      "fmg-webgl-lakes-outlines",
      "fmg-webgl-coastline",
      "fmg-webgl-states-boundaries",
      "fmg-webgl-labels",
      "fmg-webgl-burg-icons"
    ])).toEqual([
      expect.objectContaining({
        layerId: "fmg-webgl-lakes-outlines",
        exists: true,
        widthUnits: "pixels",
        widthMinPixels: 0,
        widthMaxPixels: 6
      }),
      expect.objectContaining({
        layerId: "fmg-webgl-coastline",
        exists: true,
        widthUnits: "pixels",
        widthMinPixels: 0.25,
        widthMaxPixels: 4
      }),
      expect.objectContaining({
        layerId: "fmg-webgl-states-boundaries",
        exists: true,
        widthUnits: "pixels",
        widthMinPixels: 0.35,
        widthMaxPixels: 2.5
      }),
      expect.objectContaining({ layerId: "fmg-webgl-labels", exists: true, sizeUnits: "common" }),
      expect.objectContaining({ layerId: "fmg-webgl-burg-icons", exists: true, sizeUnits: "common" })
    ]);

    const desktopSamples = await getWebglLayerStyleSamples(page, [
      "fmg-webgl-lakes-outlines",
      "fmg-webgl-coastline",
      "fmg-webgl-labels",
      "fmg-webgl-burg-icons"
    ]);
    for (const sample of desktopSamples) {
      expect(sample.dataCount, sample.layerId).toBeGreaterThan(0);
      expect(sample.width ?? sample.size, sample.layerId).toEqual(expect.any(Number));
    }

    await page.setViewportSize({ width: 390, height: 720 });
    await page.waitForFunction(() => {
      const canvas = document.getElementById("webglMapCanvas");
      return canvas instanceof HTMLCanvasElement && canvas.style.width === "390px";
    });
    const mobileStats = await waitForWebglCanvasPixels(page, 300);
    expect(mobileStats.width).toBe(780);
    expect(mobileStats.height).toBe(1440);
    expect(mobileStats.coloredPixels).toBeGreaterThan(300);

    const mobileSamples = await getWebglLayerStyleSamples(page, [
      "fmg-webgl-lakes-outlines",
      "fmg-webgl-coastline",
      "fmg-webgl-labels",
      "fmg-webgl-burg-icons"
    ]);
    for (const sample of mobileSamples) {
      expect(sample.dataCount, `mobile:${sample.layerId}`).toBeGreaterThan(0);
      expect(sample.width ?? sample.size, `mobile:${sample.layerId}`).toEqual(expect.any(Number));
    }
  });
});
