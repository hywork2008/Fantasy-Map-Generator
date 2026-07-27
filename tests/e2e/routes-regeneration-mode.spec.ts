import { expect, test } from "@playwright/test";
import {
  getLandRouteGenerationMode,
  getMapId,
  getRenderedSeaRouteNetworkSignature,
  getSeaRouteGenerationMode,
  getSeaRouteNetworkSignature,
  waitForMapLoad
} from "./helpers/fmg-helpers";

test.describe("Route regeneration mode", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/?seed=route-generation-mode&width=1280&height=720");
    await waitForMapLoad(page, "svg");
  });

  test("keeps the legacy choice when Routes is regenerated", async ({ page }) => {
    await page.locator("#optionsHide").click();
    await page.locator("#toolsTab").click();
    await expect(page.locator("#toolsContent")).toBeVisible();

    await page.locator('button[data-tip="Click to regenerate routes"]').click();
    const modeSelect = page.getByLabel("Sea route connections");
    await expect(modeSelect).toBeVisible();
    await modeSelect.selectOption("legacy");
    await expect(modeSelect).toHaveValue("legacy");
    const landModeSelect = page.getByLabel("Land route pathfinding");
    await expect(landModeSelect).toBeVisible();
    await landModeSelect.selectOption("legacy");
    await expect(landModeSelect).toHaveValue("legacy");
    await page.getByRole("button", { name: "Proceed", exact: true }).click();

    await expect.poll(() => getSeaRouteGenerationMode(page)).toBe("legacy");
    await expect.poll(() => getLandRouteGenerationMode(page)).toBe("legacy");
  });

  test("generates a legacy network instead of retaining the augmented network", async ({ page }) => {
    await page.locator("#optionsHide").click();
    await page.locator("#toolsTab").click();
    const augmentedNetwork = await getSeaRouteNetworkSignature(page);

    await page.locator('button[data-tip="Click to regenerate routes"]').click();
    await page.getByLabel("Sea route connections").selectOption("legacy");
    await page.getByRole("button", { name: "Proceed", exact: true }).click();

    await expect.poll(() => getSeaRouteGenerationMode(page)).toBe("legacy");
    await expect.poll(() => getSeaRouteNetworkSignature(page)).not.toBe(augmentedNetwork);
  });

  test("restores the legacy mode from a saved .fmg archive", async ({ page }) => {
    await page.locator("#optionsHide").click();
    await page.locator("#toolsTab").click();
    await page.locator('button[data-tip="Click to regenerate routes"]').click();
    await page.getByLabel("Sea route connections").selectOption("legacy");
    await page.getByRole("button", { name: "Proceed", exact: true }).click();
    await expect.poll(() => getSeaRouteGenerationMode(page)).toBe("legacy");
    const legacyNetwork = await getSeaRouteNetworkSignature(page);
    const renderedLegacyNetwork = await getRenderedSeaRouteNetworkSignature(page);
    const savedMapId = await getMapId(page);

    await page.locator("#saveButton").click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "machine", exact: true }).click();
    const download = await downloadPromise;
    const archivePath = await download.path();
    if (!archivePath) throw new Error("The .fmg archive download did not produce a file path");

    await page.goto("/?seed=route-generation-mode-reload&width=1280&height=720");
    await waitForMapLoad(page, "svg");
    await page.locator("#fileInputs #mapToLoad").setInputFiles(archivePath);
    await page.waitForFunction(
      ({ mapId, mode }) => window.fmg.world.mapId === mapId && window.fmg.world.options.seaRouteGenerationMode === mode,
      { mapId: savedMapId, mode: "legacy" }
    );

    expect(await getSeaRouteNetworkSignature(page)).toBe(legacyNetwork);
    await expect.poll(() => getRenderedSeaRouteNetworkSignature(page)).toBe(renderedLegacyNetwork);
  });
});
