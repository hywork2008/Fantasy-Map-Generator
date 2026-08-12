import { expect, test } from "@playwright/test";
import { isLayerOn, waitForMapLoad } from "./helpers/fmg-helpers";

async function applyGoodsTagFilter(page: import("@playwright/test").Page): Promise<void> {
  const tagFilterDialog = page.locator(".fmg-dialog").filter({ has: page.locator("#goodsTagsContainer") });
  await tagFilterDialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(tagFilterDialog).toBeHidden();
}

test.describe("Economy dialog layers", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/?seed=economy-dialog-layers&width=1280&height=720");
    await waitForMapLoad(page, "svg");

    await page.click("#optionsHide");
    await expect(page.locator("#options")).toBeVisible();
    await page.click("#extensionsTab");

    const charactersToggle = page.getByRole("checkbox", { name: "Toggle Characters extension" });
    await charactersToggle.check();
    const economyToggle = page.getByRole("checkbox", { name: "Toggle Economy, Goods & Trade extension" });
    await economyToggle.check();

    await page.click("#toolsTab");
    await expect(page.locator("#toolsContent")).toBeVisible();
  });

  for (const editor of [
    {
      button: "Goods",
      tip: "Click to open Goods Editor (Shortcut: Shift + G)",
      containerId: "goodsEditorContainer",
      layerId: "toggleGoods"
    },
    {
      button: "Markets",
      tip: "Click to open Markets Overview",
      containerId: "marketsOverviewContainer",
      layerId: "toggleMarketsLayer"
    }
  ]) {
    test(`restores ${editor.layerId} after ${editor.button} is closed with Close all dialogs`, async ({ page }) => {
      // The Tools tab also has "Goods"/"Markets" regenerate buttons (#regenerateFeature)
      // with the same accessible name as these edit buttons, so target by tooltip instead.
      await page.locator(`button[data-tip="${editor.tip}"]`).click();
      await expect(page.locator(`#${editor.containerId}`)).toBeVisible();
      await expect.poll(() => isLayerOn(page, editor.layerId)).toBe(true);

      await page
        .locator(`.fmg-dialog:has(#${editor.containerId})`)
        .getByRole("button", { name: "Close all dialogs" })
        .click();
      await expect(page.locator(`#${editor.containerId}`)).toBeHidden();
      await expect.poll(() => isLayerOn(page, editor.layerId)).toBe(false);
    });
  }

  test("keeps all matching goods visible when tag choices change", async ({ page }) => {
    await page.locator('button[data-tip="Click to open Goods Editor (Shortcut: Shift + G)"]').click();
    await expect(page.locator("#goodsEditorContainer")).toBeVisible();

    await page.locator("#goodsTagsFilter").click();
    await page.getByRole("checkbox", { name: "stapleCrop", exact: true }).check();
    await applyGoodsTagFilter(page);
    await expect(page.locator("#goodsBody tr[data-id]")).toHaveCount(12);

    await page.locator("#goodsTagsFilter").click();
    await page.getByRole("checkbox", { name: "stapleCrop", exact: true }).uncheck();
    await page.getByRole("checkbox", { name: "stapleFood", exact: true }).check();
    await applyGoodsTagFilter(page);
    await expect(page.locator("#goodsBody tr[data-id]")).toHaveCount(1);

    await page.locator("#goodsTagsFilter").click();
    await page.getByRole("checkbox", { name: "stapleFood", exact: true }).uncheck();
    await page.getByRole("checkbox", { name: "stapleCrop", exact: true }).check();
    await applyGoodsTagFilter(page);
    await expect(page.locator("#goodsBody tr[data-id]")).toHaveCount(12);

    await page.locator("#goodsTagsFilter").click();
    await page.getByRole("checkbox", { name: "stapleFood", exact: true }).check();
    await applyGoodsTagFilter(page);
    await expect(page.locator("#goodsBody tr[data-id]")).toHaveCount(13);
  });

  test("uses millimetres consistently in Cell Info and the Crop climate guide", async ({ page }) => {
    await page.locator("#stickedCellsButton").click();
    const cellInfo = page.locator(".fmg-dialog").filter({ has: page.locator("#cellInfo") });
    await expect(cellInfo).toBeVisible();

    const map = page.locator("#map");
    const bounds = await map.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width * 0.35, bounds!.y + bounds!.height * 0.5);

    const precipitationRow = cellInfo.locator("tr").filter({ has: cellInfo.getByRole("rowheader", { name: "Precipitation" }) });
    await expect(precipitationRow).toContainText(/\d+ mm/);
    const precipitation = (await precipitationRow.locator("td").textContent())?.trim();
    expect(precipitation).toMatch(/^\d+ mm$/);

    await cellInfo.getByRole("button", { name: "Open guide", exact: true }).click();
    const cropGuide = page.locator(".fmg-dialog").filter({ has: page.getByRole("heading", { name: "Crop climate guide" }) });
    await expect(cropGuide).toBeVisible();
    await expect(cropGuide).toContainText(`Annual precipitation ${precipitation}`);

    await cropGuide.getByRole("combobox", { name: "Crop" }).selectOption({ label: "Olives" });
    await expect(cropGuide).toContainText("viable 2000 mm–12000 mm · ideal 4000 mm–7000 mm");

    await cropGuide.getByRole("combobox", { name: "Crop" }).selectOption({ label: "Lemons" });
    await expect(cropGuide).toContainText("viable 300 mm–4000 mm · ideal 1000 mm–2300 mm");

    await cropGuide.getByRole("combobox", { name: "Crop" }).selectOption({ label: "Wheat" });
    await expect(cropGuide).toContainText("viable 300 mm–1600 mm · ideal 750 mm–900 mm");

    await cropGuide.getByRole("tab", { name: "Compare crops", exact: true }).click();
    await cropGuide.getByRole("tab", { name: "Annual precipitation", exact: true }).click();
    const precipitationScale = cropGuide.locator(".crop-climate-compare .crop-climate-scale");
    await expect(precipitationScale).toContainText("4400 mm");
    await expect(precipitationScale).not.toContainText("9000 mm");
  });
});
