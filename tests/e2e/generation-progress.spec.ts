import { expect, test } from "@playwright/test";

test("shows the generated landscape before map completion", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/?seed=landscape-preview&width=1280&height=720");

  await expect(page.getByRole("heading", { name: "Landscape outline", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate entire map", exact: true })).toBeVisible();
  await expect(page.locator("#featurePaths path").first()).toBeAttached();
  await expect(page.locator("#landHeights > *").first()).toBeAttached();
  await expect(page.locator("#terrs")).toBeVisible();

  await page.locator("#viewbox").dispatchEvent("mousemove", { clientX: 8, clientY: 8 });
  await expect.poll(() => pageErrors).toEqual([]);
});

test("keeps generation settings available and locks map controls", async ({ page }) => {
  await page.goto("/?seed=generation-settings&width=1280&height=720");

  await expect(page.getByRole("heading", { name: "Landscape outline", exact: true })).toBeVisible();
  await expect(page.locator("#optionsTab")).toBeEnabled();
  await expect(page.locator("#layersTab")).toBeDisabled();
  await expect(page.locator("#styleTab")).toBeDisabled();
  await expect(page.locator("#toolsTab")).toBeDisabled();
  await expect(page.locator("#optionsTabContent")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generation", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "UI", exact: true })).toBeDisabled();
  await expect(page.locator("#optionsTabContent th")).toHaveText([
    "1. Landscape outline",
    "2. Climate and waterways",
    "3. Cultures and settlements",
    "4. Realms and routes",
    "5. Finish the world"
  ]);

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
});

test("provides stage-safe review layers through the build map dialog", async ({ page }) => {
  await page.goto("/?seed=stage-review-layers&width=1280&height=720");

  const buildMap = page.locator(".generation-progress-dialog");
  await expect(buildMap.getByRole("button", { name: "Terrain", exact: true })).toHaveAttribute("aria-pressed", "true");

  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(buildMap.getByRole("heading", { name: "Climate and waterways", exact: true })).toBeVisible();
  await expect(buildMap.getByRole("button", { name: "Biomes", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#biomes path").first()).toBeAttached();

  const rivers = buildMap.getByRole("button", { name: "Rivers", exact: true });
  await rivers.click();
  await expect(rivers).toHaveAttribute("aria-pressed", "true");

  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(buildMap.getByRole("heading", { name: "Cultures and settlements", exact: true })).toBeVisible();
  await expect(buildMap.getByRole("button", { name: "Settlements", exact: true })).toHaveAttribute("aria-pressed", "true");

  await buildMap.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(buildMap.getByRole("heading", { name: "Realms and routes", exact: true })).toBeVisible();
  await expect(buildMap.getByRole("button", { name: "States", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(buildMap.getByRole("button", { name: "Borders", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#statesBody path").first()).toBeAttached();
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
