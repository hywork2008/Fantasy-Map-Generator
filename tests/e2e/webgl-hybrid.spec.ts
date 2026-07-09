import { expect, type Page, test } from "@playwright/test";
import {
  getFirstLandScreenPoint,
  getWebglDeckLayerIds,
  getWebglCanvasPixelStats,
  getViewTransformState,
  setLayerPreset,
  setRenderMode,
  waitForMapLoad,
  waitForWebglCanvasPixels,
  zoomToMapCenter
} from "./helpers/fmg-helpers";

async function getSvgGroupState(page: Page, selector: string) {
  return page.locator(selector).evaluate(element => ({
    display: window.getComputedStyle(element).display,
    childCount: element.children.length
  }));
}

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
    await expect(page.locator("#labels")).toBeVisible();
    await expect(page.locator("#scaleBar")).toBeVisible();
    await expect(page.locator("#regions")).toBeHidden();
    await expect(page.locator("#rivers")).toBeHidden();
    await expect(page.locator("#lakes")).toBeHidden();
    await expect(page.locator("#coastline")).toBeHidden();
    await expect
      .poll(() => getWebglDeckLayerIds(page), { timeout: 5000 })
      .toEqual(expect.arrayContaining(["fmg-webgl-lakes", "fmg-webgl-lakes-outlines", "fmg-webgl-coastline"]));
    const burgIconsState = await getSvgGroupState(page, "#burgIcons");
    expect(burgIconsState.display).not.toBe("none");
    expect(burgIconsState.childCount).toBeGreaterThan(0);

    const beforeZoomTransform = await getViewTransformState(page);
    await zoomToMapCenter(page, 3);
    const afterZoomStats = await waitForWebglCanvasPixels(page);
    expect(afterZoomStats.coloredPixels).toBeGreaterThan(500);
    await expect(page.locator("#labels")).toBeVisible();
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
      { name: "political", layers: ["fmg-webgl-states", "fmg-webgl-states-boundaries", "fmg-webgl-borders"] },
      { name: "cultural", layers: ["fmg-webgl-cultures", "fmg-webgl-cultures-boundaries", "fmg-webgl-borders"] },
      { name: "religions", layers: ["fmg-webgl-religions", "fmg-webgl-religions-boundaries", "fmg-webgl-borders"] },
      { name: "provinces", layers: ["fmg-webgl-provinces", "fmg-webgl-provinces-boundaries", "fmg-webgl-borders"] },
      { name: "biomes", layers: ["fmg-webgl-biomes", "fmg-webgl-rivers"] },
      { name: "physical", layers: ["fmg-webgl-height", "fmg-webgl-rivers"] },
      { name: "military", layers: ["fmg-webgl-states", "fmg-webgl-states-boundaries", "fmg-webgl-borders"] }
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
      await expect(page.locator("#scaleBar")).toBeVisible();
    }
  });
});
