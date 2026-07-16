import { expect, test } from "@playwright/test";
import { isLayerOn, setRenderMode, waitForMapLoad } from "./helpers/fmg-helpers";

test.describe("Economy dialog layers", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/?seed=economy-dialog-layers&width=1280&height=720");
    await waitForMapLoad(page);
    await setRenderMode(page, "svg");

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
});
