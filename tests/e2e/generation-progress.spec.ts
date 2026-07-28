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
  await expect(heightmapDialog.getByRole("button", { name: "New Map", exact: true })).toBeDisabled();
  await expect(heightmapDialog.getByRole("button", { name: "Edit Templates", exact: true })).toBeDisabled();
  await expect(page.locator("#newMapButton")).toBeDisabled();
});
