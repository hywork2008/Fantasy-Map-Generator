import { expect, type Page, test } from "@playwright/test";
import {
  HYBRID_SVG_OVERLAY_LAYER_IDS,
  WEBGL_MANAGED_SVG_LAYER_IDS
} from "../../src/renderers/webgl/hybridLayerPolicy";
import {
  getFirstLandScreenPoint,
  getWebglDeckLayerIds,
  getWebglCanvasPixelStats,
  getWebglLayerPolicyState,
  getWebglRendererDomState,
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

test.describe("webgl hybrid renderer", () => {
  test("renders non-empty canvas and keeps SVG overlays after zoom and resize", async ({ page }) => {
    await page.goto("/?seed=webgl-hybrid&width=1280&height=720");
    await waitForMapLoad(page);

    await setRenderMode(page, "webglHybrid");
    const initialStats = await waitForWebglCanvasPixels(page);
    expect(initialStats.coloredPixels).toBeGreaterThan(500);
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
    await expect(getWebglCanvasPixelStats(page)).resolves.toMatchObject({ coloredPixels: expect.any(Number) });
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
});
