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

    await page.click("#optionsTrigger");
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
    { button: "Goods", dialogId: "goodsEditor", layerId: "toggleGoods" },
    { button: "Markets", dialogId: "marketsOverview", layerId: "toggleMarketsLayer" }
  ]) {
    test(`restores ${editor.layerId} after ${editor.button} is closed with Close all dialogs`, async ({ page }) => {
      await page.getByRole("button", { name: editor.button, exact: true }).click();
      await expect(page.locator(`#${editor.dialogId}`)).toBeVisible();
      await expect.poll(() => isLayerOn(page, editor.layerId)).toBe(true);

      await page
        .locator(`.fmg-dialog:has(#${editor.dialogId})`)
        .getByRole("button", { name: "Close all dialogs" })
        .click();
      await expect(page.locator(`#${editor.dialogId}`)).toBeHidden();
      await expect.poll(() => isLayerOn(page, editor.layerId)).toBe(false);
    });
  }
});
