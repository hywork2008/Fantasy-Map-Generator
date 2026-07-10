import { expect, type Page, test } from "@playwright/test";
import {
  HYBRID_SVG_OVERLAY_LAYER_IDS,
  WEBGL_MANAGED_SVG_LAYER_IDS
} from "../../src/renderers/webgl/hybridLayerPolicy";
import {
  applyStylePreset,
  ensureLayerOn,
  getFirstLandScreenPoint,
  getWebglDeckLayerIds,
  getWebglCanvasPixelStats,
  getWebglLayerRenderingProps,
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
