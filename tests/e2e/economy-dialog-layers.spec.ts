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
});
