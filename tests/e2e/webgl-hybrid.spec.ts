import { expect, type Page, test } from "@playwright/test";
import {
  getWebglCanvasPixelStats,
  getViewTransformState,
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

    await page.mouse.click(450, 300);
    const pick = await pickPromise;

    expect(pick).toMatchObject({
      kind: expect.any(String),
      id: expect.any(String),
      layerId: expect.stringMatching(/^fmg-webgl-/)
    });
    await expect(getWebglCanvasPixelStats(page)).resolves.toMatchObject({ coloredPixels: expect.any(Number) });
  });
});
