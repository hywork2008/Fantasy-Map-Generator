import { expect, test } from "@playwright/test";
import { ensureLayerOff, ensureLayerOn, waitForMapLoad } from "./helpers/fmg-helpers";

test.describe("map context menu", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?seed=test-seed&width=1280&height=720");
    await waitForMapLoad(page, "svg");
    await ensureLayerOff(page, "toggleLabels");
    const optionsToggle = page.locator("#optionsHide");
    if ((await optionsToggle.textContent())?.trim() !== "►") {
      await optionsToggle.click();
    }
  });

  test("replaces the browser menu with Distance from/to here", async ({ page }) => {
    const map = page.locator("#map");
    await map.click({ button: "right", position: { x: 900, y: 360 } });

    const menu = page.getByRole("menu", { name: "Map menu" });
    await expect(menu).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Distance from here" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Distance to here" })).toBeDisabled();

    await page.getByRole("menuitem", { name: "Distance from here" }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator("#ruler .distance-from-pending circle")).toBeVisible();

    await map.click({ button: "right", position: { x: 980, y: 400 } });
    await expect(page.getByRole("menuitem", { name: "Distance to here" })).toBeEnabled();
    await page.getByRole("menuitem", { name: "Distance to here" }).click();

    // Turning Rulers on draws the default land-span ruler; Distance to here adds a second.
    await expect(page.locator("#ruler > g.ruler")).toHaveCount(2);
    await expect(page.locator("#ruler .distance-from-pending")).toHaveCount(0);
  });

  test("keeps the default ruler endpoints when they are clicked", async ({ page }) => {
    await ensureLayerOn(page, "toggleRulers");
    await expect(page.locator("#ruler > g.ruler")).toHaveCount(1);
    await expect(page.locator("#ruler circle.edge")).toHaveCount(2);

    await page.locator("#ruler circle.edge").first().click();
    await page.locator("#ruler circle.edge").last().click();

    await expect(page.locator("#ruler > g.ruler")).toHaveCount(1);
    await expect(page.locator("#ruler circle.edge")).toHaveCount(2);
  });
});
