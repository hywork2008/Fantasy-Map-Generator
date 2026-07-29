import { expect, test } from "@playwright/test";
import { applyStylePreset, getMapCanvasSize, setRenderMode, waitForMapLoad, zoomToMapCenter } from "./helpers/fmg-helpers";

test("recovers from an invalid canvas size saved by an earlier version", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mapWidth", "0");
    localStorage.setItem("mapHeight", "0");
  });

  await page.goto("/?seed=invalid-persisted-canvas-size");
  await waitForMapLoad(page, "svg");
  expect(await getMapCanvasSize(page)).toEqual({ width: 1280, height: 720 });
});

test("keeps the latest locked settlement and demographic settings after reload", async ({ page }) => {
  await page.goto("/?seed=locked-options-reload&width=1000&height=700");
  await waitForMapLoad(page, "svg");

  await page.locator("#optionsHide").click();

  const generation = page.locator("#optionsTabContent");
  const populationRow = generation.locator("tr").filter({ hasText: "Initial population %" });
  const patternRow = generation.locator("tr").filter({ hasText: "Settlement pattern" });

  await patternRow.getByRole("combobox").selectOption("frontier");
  await expect(populationRow.getByRole("spinbutton")).toHaveValue("30");
  await populationRow.getByRole("spinbutton").fill("10");
  await expect(populationRow.getByRole("spinbutton")).toHaveValue("10");

  await generation.getByRole("button", { name: "Simulation", exact: true }).click();
  const simulation = page.locator("#optionsTabContent");
  const birthRateRow = simulation.locator("tr").filter({ hasText: "Base Birth Rate" });
  const childMortalityRow = simulation.locator("tr").filter({ hasText: "Child Mortality %" });

  await birthRateRow.getByRole("spinbutton").fill("0.4");
  await childMortalityRow.getByRole("spinbutton").fill("37");

  await page.reload();
  await waitForMapLoad(page, "svg");
  await page.locator("#optionsHide").click();

  const restoredGeneration = page.locator("#optionsTabContent");
  await expect(restoredGeneration.locator("tr").filter({ hasText: "Settlement pattern" }).getByRole("combobox")).toHaveValue(
    "frontier"
  );
  await expect(
    restoredGeneration.locator("tr").filter({ hasText: "Initial population %" }).getByRole("spinbutton")
  ).toHaveValue("10");

  await restoredGeneration.getByRole("button", { name: "Simulation", exact: true }).click();
  const restoredSimulation = page.locator("#optionsTabContent");
  await expect(restoredSimulation.locator("tr").filter({ hasText: "Base Birth Rate" }).getByRole("spinbutton")).toHaveValue(
    "0.4"
  );
  await expect(restoredSimulation.locator("tr").filter({ hasText: "Child Mortality %" }).getByRole("spinbutton")).toHaveValue(
    "37"
  );
});

test("moves and resizes the options panel using its tab bar and lower-right handle", async ({ page }) => {
  await page.goto("/?seed=options-panel-interactions&width=1000&height=700");
  await waitForMapLoad(page, "svg");

  await page.locator("#optionsHide").click();

  const options = page.locator("#options");
  const tab = options.locator(":scope > .tab");
  const tabBox = await tab.boundingBox();
  const viewport = page.viewportSize();
  expect(tabBox).not.toBeNull();
  expect(viewport).not.toBeNull();

  // The entire compact tab bar is the drag handle, including its tab buttons.
  await page.mouse.move(tabBox!.x + tabBox!.width - 12, tabBox!.y + tabBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport!.width - 1, viewport!.height - 1, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const box = await options.boundingBox();
      return box ? viewport!.width - (box.x + box.width) : Infinity;
    })
    .toBeLessThanOrEqual(1);
  await expect
    .poll(async () => {
      const box = await options.boundingBox();
      return box ? viewport!.height - (box.y + box.height) : Infinity;
    })
    .toBeLessThanOrEqual(1);

  const bottomRightTabBox = await tab.boundingBox();
  expect(bottomRightTabBox).not.toBeNull();
  await page.mouse.move(bottomRightTabBox!.x + 12, bottomRightTabBox!.y + bottomRightTabBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(0, 0, { steps: 5 });
  await page.mouse.up();

  await expect.poll(async () => (await options.boundingBox())?.x ?? Infinity).toBeLessThanOrEqual(1);
  await expect.poll(async () => (await options.boundingBox())?.y ?? Infinity).toBeLessThanOrEqual(1);

  const movedBox = await options.boundingBox();
  const resizeHandle = options.locator(".fmg-dialog-resize");
  const resizeBox = await resizeHandle.boundingBox();
  expect(movedBox).not.toBeNull();
  expect(resizeBox).not.toBeNull();

  await page.mouse.move(resizeBox!.x + resizeBox!.width / 2, resizeBox!.y + resizeBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox!.x + resizeBox!.width / 2 + 60, resizeBox!.y + resizeBox!.height / 2 + 48, {
    steps: 5
  });
  await page.mouse.up();

  await expect.poll(async () => (await options.boundingBox())?.width ?? 0).toBeGreaterThan(movedBox!.width + 45);
  await expect.poll(async () => (await options.boundingBox())?.height ?? 0).toBeGreaterThan(movedBox!.height + 35);
});

test("moves dialogs flush to the viewport edges", async ({ page }) => {
  await page.goto("/?seed=dialog-edge-placement&width=1000&height=700");
  await waitForMapLoad(page, "svg");
  await page.locator("#optionsHide").click();
  await page.locator("#exportButton").click();

  const dialog = page.locator(".fmg-dialog", { has: page.locator("#exportMapData") });
  const titlebar = dialog.locator(".titlebar");
  const viewport = page.viewportSize();
  const titlebarBox = await titlebar.boundingBox();
  expect(viewport).not.toBeNull();
  expect(titlebarBox).not.toBeNull();

  await page.mouse.move(titlebarBox!.x + 12, titlebarBox!.y + titlebarBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport!.width - 1, viewport!.height - 1, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const box = await dialog.boundingBox();
      return box ? viewport!.width - (box.x + box.width) : Infinity;
    })
    .toBeLessThanOrEqual(1);
  await expect
    .poll(async () => {
      const box = await dialog.boundingBox();
      return box ? viewport!.height - (box.y + box.height) : Infinity;
    })
    .toBeLessThanOrEqual(1);

  const bottomRightTitlebarBox = await titlebar.boundingBox();
  expect(bottomRightTitlebarBox).not.toBeNull();
  await page.mouse.move(bottomRightTitlebarBox!.x + 12, bottomRightTitlebarBox!.y + bottomRightTitlebarBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(0, 0, { steps: 5 });
  await page.mouse.up();

  await expect.poll(async () => (await dialog.boundingBox())?.x ?? Infinity).toBeLessThanOrEqual(1);
  await expect.poll(async () => (await dialog.boundingBox())?.y ?? Infinity).toBeLessThanOrEqual(1);
});

test("switches the SVG heightmap between canvas heatmap and contour paths", async ({ page }) => {
  await page.goto("/?seed=heightmap-rendering-mode&width=1000&height=700");
  await waitForMapLoad(page, "svg");
  await page.locator("#optionsHide").click();
  await page.locator("#layersTab").click();

  const heightmapToggle = page.locator("#toggleHeight");
  if ((await heightmapToggle.getAttribute("class"))?.includes("buttonoff")) await heightmapToggle.click();
  await expect(page.locator("#landHeights foreignObject.fmc")).toHaveCount(0);
  await expect(page.locator("#landHeights path.heightmap-contour-line").first()).toHaveAttribute("fill", "none");
  await expect.poll(async () => page.locator("#landHeights .heightmap-contour-labels text").count()).toBeGreaterThan(0);

  const layerOrder = await page.locator("#viewbox > *").evaluateAll(layers => layers.map(layer => layer.id));
  expect(layerOrder.indexOf("terrs")).toBeGreaterThan(layerOrder.indexOf("biomes"));

  await page.locator("#optionsTab").click();
  await page.locator("#optionsTabContent").getByRole("button", { name: "UI", exact: true }).click();

  const renderingMode = page.locator("#heightmapRenderingMode");
  await expect(renderingMode).toHaveValue("labeledContours");
  await renderingMode.selectOption("heatmap");

  await expect(renderingMode).toHaveValue("heatmap");
  await expect(page.locator("#landHeights foreignObject.fmc")).toHaveCount(1);
  await renderingMode.selectOption("contours");

  await expect(renderingMode).toHaveValue("contours");
  await expect(page.locator("#landHeights foreignObject.fmc")).toHaveCount(0);
  await expect(page.locator("#landHeights path.heightmap-contour-base")).toHaveCount(1);
  await expect.poll(async () => page.locator("#landHeights > path").count()).toBeGreaterThan(1);

  await renderingMode.selectOption("labeledContours");

  await expect(renderingMode).toHaveValue("labeledContours");
  await expect(page.locator("#landHeights path.heightmap-contour-base")).toHaveCount(0);
  await expect(page.locator("#landHeights path.heightmap-contour-line").first()).toHaveAttribute("fill", "none");
  await expect(page.locator("#landHeights path.heightmap-contour-line").first()).toHaveAttribute("stroke", "#000");
  await expect.poll(async () => page.locator("#landHeights .heightmap-contour-labels text").count()).toBeGreaterThan(0);
  await expect(page.locator("#landHeights .heightmap-contour-labels text").first()).toContainText(/ m$/);

  const overviewContourCount = await page.locator("#landHeights path.heightmap-contour-line").count();
  await zoomToMapCenter(page, 6);
  await expect(page.locator("#landHeights .heightmap-contour-secondSupplementary")).toHaveCount(0);
  await expect.poll(async () => page.locator("#landHeights path.heightmap-contour-line").count()).toBeGreaterThan(0);
  await expect.poll(async () => page.locator("#landHeights path.heightmap-contour-line").count()).toBeLessThan(
    overviewContourCount
  );
});

test("keeps ocean height contours disabled when applying supported style presets in SVG mode", async ({ page }) => {
  await page.goto("/?seed=style-preset-ocean-contours&width=1000&height=700");
  await waitForMapLoad(page, "svg");

  for (const preset of ["gloom", "light", "watercolor", "clean", "atlas", "cyberpunk"]) {
    await applyStylePreset(page, preset);
    await setRenderMode(page, "svg");

    await expect(page.locator("#oceanHeights")).toHaveAttribute("data-render", "0");
    await expect(page.locator("#oceanHeights > *")).toHaveCount(0);
  }
});
