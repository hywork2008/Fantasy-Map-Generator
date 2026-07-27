import { expect, test } from "@playwright/test";
import { waitForMapLoad } from "./helpers/fmg-helpers";

test("shows Exit Customization at the lower-right after selecting a heightmap edit mode", async ({ page }) => {
  await page.goto("/?seed=heightmap-exit-customization&width=1000&height=700");
  await waitForMapLoad(page, "svg");

  await page.locator("#optionsHide").click();
  await page.locator("#toolsTab").click();
  await page.locator("#editHeightmapButton").click();
  await page.getByRole("button", { name: "Erase", exact: true }).click();

  const exitCustomization = page.locator("#exitCustomization");
  await expect(exitCustomization).toBeVisible();
  await expect(exitCustomization.getByRole("button", { name: "Exit Customization", exact: true })).toBeVisible();

  await expect
    .poll(async () => {
      const box = await exitCustomization.boundingBox();
      const viewport = page.viewportSize();
      return box && viewport ? viewport.width - (box.x + box.width) : Infinity;
    })
    .toBeLessThanOrEqual(11);
  await expect
    .poll(async () => {
      const box = await exitCustomization.boundingBox();
      const viewport = page.viewportSize();
      return box && viewport ? viewport.height - (box.y + box.height) : Infinity;
    })
    .toBeLessThanOrEqual(11);

  // A visible control that sits below the map cannot be used to leave edit mode.
  await exitCustomization.getByRole("button", { name: "Exit Customization", exact: true }).click({ trial: true });
});
