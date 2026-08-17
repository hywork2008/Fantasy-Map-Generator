import { expect, test } from "@playwright/test";
import {
  collectPageErrors,
  filterCriticalErrors,
  getMapCanvasSize,
  getMapCoordinates,
  getMapDistanceScale,
  waitForMapGeneration
} from "./helpers/fmg-helpers";

async function getCoastlineSignature(page: import("@playwright/test").Page): Promise<string> {
  return page.locator("#featurePaths path").evaluateAll(paths =>
    paths
      .map(path => path.getAttribute("d") ?? "")
      .sort()
      .join("|")
  );
}

async function expectStageReady(
  dialog: import("@playwright/test").Locator,
  title: string
): Promise<void> {
  await expect(dialog.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(dialog.getByText("Ready to review", { exact: true })).toBeVisible();
}

test("shows the generated landscape before map completion", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/?seed=landscape-preview&width=1280&height=720");

  await expect(page.getByRole("heading", { name: "Landscape outline", exact: true })).toBeVisible();
  await expect(page.locator(".generation-progress-dialog").getByRole("button", { name: "Close all dialogs" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate entire map", exact: true })).toBeVisible();
  await expect(page.locator("#featurePaths path").first()).toBeAttached();
  await expect(page.locator("#landHeights > *").first()).toBeAttached();
  await expect(page.locator("#terrs")).toBeVisible();

  await page.locator("#viewbox").dispatchEvent("mousemove", { clientX: 8, clientY: 8 });
  await expect.poll(() => pageErrors).toEqual([]);
});

test("defers volcanic-soil biome updates until climate data exists", async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  await page.goto("/?seed=volcanic-soil-landscape-review&width=1280&height=720");

  await expect(page.getByRole("heading", { name: "Landscape outline", exact: true })).toBeVisible();
  const generation = page.locator("#optionsTabContent");
  await generation.locator("tr", { hasText: "Volcanism chance %" }).getByRole("spinbutton").fill("100");
  await generation.locator("tr", { hasText: "Active volcano chance %" }).getByRole("spinbutton").fill("100");
  await page.getByRole("button", { name: "Generate another landscape", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Landscape outline", exact: true })).toBeVisible();
  await generation.locator("tr", { hasText: "Volcanic soil strength %" }).getByRole("spinbutton").fill("75");

  await expect.poll(() => filterCriticalErrors(pageErrors)).toEqual([]);
});

test("enables Danger settings during initial review for fantasy culture sets", async ({ page }) => {
  await page.goto("/?seed=fantasy-danger-settings&width=1280&height=720");

  const dangerTab = page.getByRole("button", { name: "Danger", exact: true });
  await expect(dangerTab).toBeDisabled();

  await page.locator("#culturesSet").selectOption("highFantasy");
  await expect(dangerTab).toBeEnabled();
  await dangerTab.click();
  await expect(page.getByText("Danger settings:", { exact: true })).toBeVisible();
});

test("keeps generation settings available and exposes first-map setup controls", async ({ page }) => {
  await page.goto("/?seed=generation-settings&width=1280&height=720");

  await expect(page.getByRole("heading", { name: "Landscape outline", exact: true })).toBeVisible();
  await expect(page.locator("#optionsTab")).toBeEnabled();
  await expect(page.locator("#layersTab")).toBeDisabled();
  await expect(page.locator("#styleTab")).toBeDisabled();
  await expect(page.locator("#toolsTab")).toBeDisabled();
  await expect(page.locator("#extensionsTab")).toBeEnabled();
  await expect(page.locator("#optionsTabContent")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generation", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "UI", exact: true })).toBeEnabled();
  await expect(page.locator("#loadButton")).toBeEnabled();
  for (const stageLabel of [
    "1. Landscape outline",
    "2. Climate and waterways",
    "3. Cultures and settlements",
    "4. Realms and routes",
    "5. Finish the world"
  ]) {
    await expect(page.locator("#optionsTabContent th").filter({ hasText: stageLabel })).toBeVisible();
  }

  await page.locator("#templateInputContainer").click();
  await expect(page.getByRole("heading", { name: "Heightmap templates", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select", exact: true })).toBeEnabled();
  const heightmapDialog = page.locator("#heightmapSelectionDialog");
  const templateTab = heightmapDialog.getByRole("tab", { name: "Heightmap templates", exact: true });
  const precreatedTab = heightmapDialog.getByRole("tab", { name: "Precreated heightmaps", exact: true });
  await expect(templateTab).toHaveAttribute("aria-selected", "true");
  await expect(precreatedTab).toHaveAttribute("aria-selected", "false");
  await expect(heightmapDialog.locator(".heightmap-selection_footer")).toBeVisible();
  await precreatedTab.click();
  await expect(precreatedTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Precreated heightmaps", exact: true })).toBeVisible();
  await expect(heightmapDialog.locator(".heightmap-selection_footer")).toBeVisible();
  await expect(heightmapDialog.getByRole("button", { name: "New Map", exact: true })).toBeDisabled();
  await expect(heightmapDialog.getByRole("button", { name: "Edit Templates", exact: true })).toBeDisabled();
  await expect(page.locator("#newMapButton")).toBeDisabled();

  await page.getByRole("button", { name: "UI", exact: true }).click();
  await expect(page.locator("#optionsReset")).toBeEnabled();

  await page.locator("#extensionsTab").click();
  await expect(page.locator("#extensionsTabContent")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Toggle Characters extension" })).toBeEnabled();
  await expect(page.getByRole("checkbox", { name: "Toggle Economy, Goods & Trade extension" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Toggle Nobility & Characters extension" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Toggle Shipbuilding extension" })).toBeVisible();

  const charactersToggle = page.getByRole("checkbox", { name: "Toggle Characters extension" });
  const economyToggle = page.getByRole("checkbox", { name: "Toggle Economy, Goods & Trade extension" });
  await charactersToggle.check();
  await economyToggle.check();
  await expect(charactersToggle).toBeChecked();
  await expect(economyToggle).toBeChecked();
  await expect(page.getByText("Extensions cannot be changed while map generation is in progress.")).toHaveCount(0);

  await page.locator("#loadButton").click();
  await expect(page.getByText("Load Map", { exact: true })).toBeVisible();
});

test("lists every built-in extension after a browser reload", async ({ page }) => {
  await page.goto("/?seed=extensions-reload&width=1280&height=720");
  await page.reload();

  await page.locator("#extensionsTab").click();
  await expect(page.getByRole("checkbox", { name: "Toggle Characters extension" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Toggle Economy, Goods & Trade extension" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Toggle Nobility & Characters extension" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Toggle Shipbuilding extension" })).toBeVisible();
});

test("lists every built-in extension after enabled extensions persist through a reload", async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  await page.goto("/?seed=extensions-enabled-reload&width=1280&height=720");
  await waitForMapGeneration(page);

  await page.locator("#extensionsTab").click();
  await page.getByRole("checkbox", { name: "Toggle Characters extension" }).check();
  await page.getByRole("checkbox", { name: "Toggle Economy, Goods & Trade extension" }).check();
  await page.getByRole("checkbox", { name: "Toggle Nobility & Characters extension" }).check();
  await page.getByRole("checkbox", { name: "Toggle Shipbuilding extension" }).check();

  await page.reload();
  await expect.poll(() => filterCriticalErrors(pageErrors)).toEqual([]);
  await page.locator("#extensionsTab").click();
  await expect(page.getByRole("checkbox", { name: "Toggle Characters extension" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Toggle Economy, Goods & Trade extension" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Toggle Nobility & Characters extension" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Toggle Shipbuilding extension" })).toBeVisible();
});

test("provides stage-safe review layers through the build map dialog", async ({ page }) => {
  await page.goto("/?seed=stage-review-layers&width=1280&height=720");

  const buildMap = page.locator(".generation-progress-dialog");
  await expect(buildMap.getByRole("button", { name: "Terrain", exact: true })).toHaveAttribute("aria-pressed", "true");

  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(buildMap.getByRole("heading", { name: "Climate and waterways", exact: true })).toBeVisible();
  await expect(buildMap.getByRole("button", { name: "Biomes", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#biomes path").first()).toBeAttached();

  const returnToPrevious = buildMap.getByRole("button", { name: "Return to previous stage", exact: true });
  const continueStage = buildMap.getByRole("button", { name: "Continue", exact: true });
  const generateEntireMap = buildMap.getByRole("button", { name: "Generate entire map", exact: true });
  const biomeRegion = buildMap.locator("#generationBiomeRegionProfile");
  const regenerateClimate = buildMap.getByRole("button", { name: "Regenerate climate and waterways", exact: true });
  const [previousBounds, continueBounds, allBounds, profileBounds, regenerateBounds] = await Promise.all([
    returnToPrevious.boundingBox(),
    continueStage.boundingBox(),
    generateEntireMap.boundingBox(),
    biomeRegion.boundingBox(),
    regenerateClimate.boundingBox()
  ]);
  expect(previousBounds).not.toBeNull();
  expect(continueBounds).not.toBeNull();
  expect(allBounds).not.toBeNull();
  expect(profileBounds).not.toBeNull();
  expect(regenerateBounds).not.toBeNull();
  expect(previousBounds!.x).toBeLessThan(continueBounds!.x);
  expect(allBounds!.y).toBeGreaterThan(continueBounds!.y);
  expect(allBounds!.x + allBounds!.width).toBeGreaterThanOrEqual(continueBounds!.x + continueBounds!.width);
  expect(regenerateBounds!.x).toBeGreaterThanOrEqual(profileBounds!.x + profileBounds!.width);

  const rivers = buildMap.getByRole("button", { name: "Rivers", exact: true });
  await rivers.click();
  await expect(rivers).toHaveAttribute("aria-pressed", "true");

  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(buildMap.getByRole("heading", { name: "Cultures and settlements", exact: true })).toBeVisible();
  await expect(buildMap.getByRole("button", { name: "Settlements", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(buildMap.getByRole("button", { name: "Apply culture and settlement changes", exact: true })).toBeEnabled();

  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(buildMap.getByRole("heading", { name: "Realms and routes", exact: true })).toBeVisible();
  await expect(buildMap.getByRole("button", { name: "States", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(buildMap.getByRole("button", { name: "Borders", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(buildMap.getByRole("button", { name: "Apply realm and route changes", exact: true })).toBeEnabled();
  await expect(page.locator("#statesBody path").first()).toBeAttached();
});

test("regenerates culture and realm stages with the current generation settings", async ({ page }) => {
  await page.goto("/?seed=stage-apply-settings&width=1280&height=720");

  const buildMap = page.locator(".generation-progress-dialog");
  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expectStageReady(buildMap, "Climate and waterways");
  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expectStageReady(buildMap, "Cultures and settlements");

  const culturesNumber = page.locator("tr", { hasText: "Cultures number" }).locator('input[type="number"]');
  await culturesNumber.fill("1");
  await expect(culturesNumber).toHaveValue("1");
  const culturesNumberRange = page.locator("tr", { hasText: "Cultures number" }).locator('input[type="range"]');
  await expect(culturesNumberRange).toHaveValue("1");
  await expect(culturesNumberRange).toHaveCSS("--range-progress", "0%");
  await buildMap.getByRole("button", { name: "Apply culture and settlement changes", exact: true }).click();
  await expectStageReady(buildMap, "Cultures and settlements");

  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expectStageReady(buildMap, "Realms and routes");

  const statesNumber = page.locator("tr", { hasText: "States number" }).locator('input[type="number"]');
  await statesNumber.fill("2");
  await expect(statesNumber).toHaveValue("2");
  const statesNumberRange = page.locator("tr", { hasText: "States number" }).locator('input[type="range"]');
  await expect(statesNumberRange).toHaveValue("2");
  await expect(statesNumberRange).toHaveCSS("--range-progress", "2%");
  await buildMap.getByRole("button", { name: "Apply realm and route changes", exact: true }).click();
  await expectStageReady(buildMap, "Realms and routes");
});

test("applies climate configuration when the climate stage is regenerated", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/?seed=stage-climate-settings&width=1280&height=720");

  const buildMap = page.locator(".generation-progress-dialog");
  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(buildMap.getByRole("heading", { name: "Climate and waterways", exact: true })).toBeVisible();

  const biomeRegion = buildMap.locator("#generationBiomeRegionProfile");
  await expect(biomeRegion).toHaveAttribute("name", "biomeRegionProfile");
  await biomeRegion.selectOption("mediterranean");
  await expect(page.locator("#biomeRegionProfile")).toHaveValue("mediterranean");

  const heightExponent = buildMap.locator("#generationHeightExponent");
  await expect(heightExponent).toHaveAttribute("name", "heightExponent");
  const worldConfigurator = buildMap.getByRole("button", { name: "Open World Configurator", exact: true });
  await expect(worldConfigurator).toBeEnabled();
  await expect(worldConfigurator).toHaveClass("generation-progress-dialog__world-configurator");
  await expect(worldConfigurator).toHaveCSS("opacity", "1");
  const [biomeBounds, exponentBounds, configuratorBounds] = await Promise.all([
    biomeRegion.boundingBox(),
    heightExponent.boundingBox(),
    worldConfigurator.boundingBox()
  ]);
  expect(biomeBounds).not.toBeNull();
  expect(exponentBounds).not.toBeNull();
  expect(configuratorBounds).not.toBeNull();
  expect(exponentBounds!.y).toBeGreaterThanOrEqual(biomeBounds!.y + biomeBounds!.height);
  expect(configuratorBounds!.y).toBeGreaterThanOrEqual(exponentBounds!.y + exponentBounds!.height);
  await heightExponent.focus();
  await page.keyboard.press("End");
  await expect(heightExponent).toHaveValue("2.2");
  await expect(buildMap.locator("output[for='generationHeightExponent']")).toHaveText("2.20");

  await buildMap.getByRole("button", { name: "Regenerate climate and waterways", exact: true }).click();
  await expect(buildMap.getByRole("heading", { name: "Climate and waterways", exact: true })).toBeVisible();
  await expect(buildMap.locator("#generationBiomeRegionProfile")).toHaveValue("mediterranean");

  await worldConfigurator.click();
  const configurator = page.locator("#worldConfiguratorContainer");
  await expect(configurator).toBeVisible();
  await expect(configurator.locator("#temperatureEquatorInput")).toBeEnabled();
  await expect(configurator.locator("#wcAutoChange")).toBeEnabled();
  const updateWorld = configurator.getByRole("button", { name: "Update world", exact: true });
  await expect(updateWorld).toBeEnabled();
  await configurator.locator("#mapSizeInput").fill("50");
  await updateWorld.click();
  await expect(page.locator("#biomes path").first()).toBeAttached();
  await expect.poll(() => pageErrors).toEqual([]);
});

test("updates the globe selection when applying a World Configurator preset", async ({ page }) => {
  await page.goto("/?seed=world-configurator-presets&width=1280&height=720");

  const buildMap = page.locator(".generation-progress-dialog");
  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expectStageReady(buildMap, "Climate and waterways");
  await buildMap.getByRole("button", { name: "Open World Configurator", exact: true }).click();

  const configurator = page.locator("#worldConfiguratorContainer");
  const mapSizeInput = configurator.locator("#mapSizeInput");
  const latitudeInput = configurator.locator("#latitudeInput");
  const globeArea = configurator.locator("#globeArea");
  await expect(mapSizeInput).toHaveValue("12.9");
  const latitudeMin = Number(await latitudeInput.getAttribute("min"));
  const latitudeMax = Number(await latitudeInput.getAttribute("max"));
  expect(latitudeMin).toBeLessThan(0);
  expect(latitudeMax).toBeGreaterThan(0);
  expect(latitudeMax).toBeLessThanOrEqual(90);
  expect(Number(await latitudeInput.inputValue())).toBeGreaterThanOrEqual(latitudeMin);
  expect(Number(await latitudeInput.inputValue())).toBeLessThanOrEqual(latitudeMax);
  await expect(configurator.locator("#temperatureEquatorInput")).toHaveValue("27");
  await expect(configurator.locator("#temperatureNorthPoleInput")).toHaveValue("-18");
  await expect(configurator.locator("#temperatureSouthPoleInput")).toHaveValue("-50");
  const axialTiltInput = configurator.locator("#axialTiltInput");
  await expect(axialTiltInput).toHaveValue("23.5");
  await expect(axialTiltInput).toHaveAttribute("min", "0");
  await expect(axialTiltInput).toHaveAttribute("max", "90");

  const initialCoordinates = await getMapCoordinates(page);
  const { width: graphWidth } = await getMapCanvasSize(page);
  const distanceScale = await getMapDistanceScale(page);
  expect(Math.abs((graphWidth * distanceScale * 360) / initialCoordinates.lonT! - 40_075)).toBeLessThan(100);

  await mapSizeInput.fill("100");
  await expect(mapSizeInput).toHaveValue("100");

  const wholeWorldPath = await globeArea.getAttribute("d");
  expect(wholeWorldPath).toBeTruthy();

  let northernPath = "";
  let northernScaleBarLabels = "";
  for (const [preset, expectedLatitude] of [
    ["Northern", 38.5],
    ["Tropical", 0],
    ["Southern", -38.5]
  ] as const) {
    await configurator.getByRole("button", { name: preset, exact: true }).click();
    await expect(mapSizeInput).toHaveValue("12.9");
    await expect(latitudeInput).toHaveValue(String(expectedLatitude));
    const coordinates = await getMapCoordinates(page);
    expect(coordinates.latT).toBe(26.1);
    expect((coordinates.latN! + coordinates.latS!) / 2).toBeCloseTo(expectedLatitude, 0);
    await expect.poll(() => globeArea.getAttribute("d")).not.toBe(wholeWorldPath);
    if (preset === "Northern") {
      northernPath = (await globeArea.getAttribute("d")) ?? "";
      northernScaleBarLabels = (await page.locator("#scaleBarContent").allTextContents()).join("|");
    }
    if (preset === "Tropical") {
      expect((await page.locator("#scaleBarContent").allTextContents()).join("|")).not.toBe(northernScaleBarLabels);
    }
  }

  await configurator.getByRole("button", { name: "Whole world", exact: true }).click();
  await expect(mapSizeInput).toHaveValue("100");
  await expect.poll(() => globeArea.getAttribute("d")).not.toBe(northernPath);
});

test("rotates the World Configurator globe meridian in 15° steps", async ({ page }) => {
  await page.goto("/?seed=world-configurator-meridian&width=1280&height=720");

  const buildMap = page.locator(".generation-progress-dialog");
  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expectStageReady(buildMap, "Climate and waterways");
  await buildMap.getByRole("button", { name: "Open World Configurator", exact: true }).click();

  const configurator = page.locator("#worldConfiguratorContainer");
  const meridianInput = configurator.locator("#globeMeridianInput");
  const longitudeSlider = configurator.locator("#longitudeOutput");
  const globeArea = configurator.locator("#globeArea");
  const globeMeridianLabel = configurator.locator("#globeMeridianLabel");

  const lonT = (await getMapCoordinates(page)).lonT;
  const halfWidth = lonT / 2;

  await meridianInput.fill("0");
  await meridianInput.blur();
  await expect(meridianInput).toHaveValue("0");
  await expect(globeMeridianLabel).toHaveText("0°");
  await expect(longitudeSlider).toHaveAttribute("min", String(-90 + halfWidth));
  await expect(longitudeSlider).toHaveAttribute("max", String(90 - halfWidth));
  const primeMeridianPath = await globeArea.getAttribute("d");
  expect(primeMeridianPath).toBeTruthy();

  await meridianInput.fill("135");
  await meridianInput.blur();
  await expect(meridianInput).toHaveValue("135");
  await expect(globeMeridianLabel).toHaveText("135°E");
  await expect(longitudeSlider).toHaveAttribute("min", String(45 + halfWidth));
  await expect(longitudeSlider).toHaveAttribute("max", String(225 - halfWidth));
  await expect.poll(() => globeArea.getAttribute("d")).not.toBe(primeMeridianPath);

  const beforeMove = await getMapCoordinates(page);
  const longitudeInput = configurator.locator("#longitudeInput");
  const latitudeInput = configurator.locator("#latitudeInput");
  await longitudeInput.fill("150");
  await longitudeInput.blur();
  await expect.poll(async () => {
    const coords = await getMapCoordinates(page);
    return (coords.lonW + coords.lonE) / 2;
  }).toBeCloseTo(150, 0);
  await expect.poll(() => globeArea.getAttribute("d")).not.toBe(primeMeridianPath);
  expect((await getMapCoordinates(page)).lonW).not.toBe(beforeMove.lonW);

  await latitudeInput.fill("70");
  await latitudeInput.blur();
  await expect.poll(async () => {
    const coords = await getMapCoordinates(page);
    return (coords.latN + coords.latS) / 2;
  }).toBeCloseTo(70, 0);
});

test("preserves a newly generated landscape when climate is regenerated", async ({ page }) => {
  await page.goto("/?width=1280&height=720");

  const buildMap = page.locator(".generation-progress-dialog");
  await expectStageReady(buildMap, "Landscape outline");

  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expectStageReady(buildMap, "Climate and waterways");
  await buildMap.locator("#generationBiomeRegionProfile").selectOption("medievalEurope");

  await buildMap.getByRole("button", { name: "Return to previous stage", exact: true }).click();
  await expectStageReady(buildMap, "Landscape outline");
  await buildMap.getByRole("button", { name: "Generate another landscape", exact: true }).click();
  await expectStageReady(buildMap, "Landscape outline");
  const coastlineBeforeClimate = await getCoastlineSignature(page);

  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expectStageReady(buildMap, "Climate and waterways");
  await buildMap.getByRole("button", { name: "Regenerate climate and waterways", exact: true }).click();
  await expectStageReady(buildMap, "Climate and waterways");

  expect(await getCoastlineSignature(page)).toBe(coastlineBeforeClimate);
});
