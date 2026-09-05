import { expect, test } from "@playwright/test";
import {
  findConnectedBurgPair,
  setupBurgView,
  waitForMapLoad,
} from "./helpers/fmg-helpers";

test.describe("burg-to-burg Directions dialog", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?seed=directions-e2e&width=1280&height=720");
    await waitForMapLoad(page, "svg");
  });

  test("right-clicking two connected burgs opens Directions with a working route", async ({
    page,
  }) => {
    const pair = await findConnectedBurgPair(page);
    test.skip(pair === null, "No route-connected burg pair on this seed");
    if (!pair) return;

    const map = page.locator("#map");

    // "Distance from {burg}" on the first burg.
    await setupBurgView(page, pair.aId);
    await map.click({ button: "right", position: { x: 640, y: 360 } });
    await expect(
      page.getByRole("menuitem", { name: `Distance from ${pair.aName}` })
    ).toBeVisible();
    await page
      .getByRole("menuitem", { name: `Distance from ${pair.aName}` })
      .click();

    // "Distance to {burg}" on the second burg opens the Directions dialog instead of a ruler.
    await setupBurgView(page, pair.bId);
    await map.click({ button: "right", position: { x: 640, y: 360 } });
    await expect(
      page.getByRole("menuitem", { name: `Distance to ${pair.bName}` })
    ).toBeVisible();
    await page
      .getByRole("menuitem", { name: `Distance to ${pair.bName}` })
      .click();

    const dialog = page.locator(".fmg-dialog", {
      hasText: `Directions: ${pair.aName} → ${pair.bName}`,
    });
    await expect(dialog).toBeVisible();

    // At least one land mode resolves a real route with a nonzero distance/time.
    const footTab = dialog.locator(".directions-mode", { hasText: "On foot" });
    const mountedTab = dialog.locator(".directions-mode", { hasText: "Mounted" });
    const cartTab = dialog.locator(".directions-mode", { hasText: "By cart" });
    const enabledTab = (await footTab.isEnabled()) ? footTab : cartTab;
    await expect(enabledTab).toBeEnabled();
    await expect(enabledTab).toContainText("km");
    await expect(mountedTab).toBeEnabled(); // findConnectedBurgPair guarantees a land route

    // The selected route is highlighted on the map.
    await expect(page.locator("#ruler .directions-route-highlight")).toHaveCount(1);

    // Toggling "avoid sea travel" recomputes without breaking the land route we already have.
    const avoidSea = dialog.getByRole("checkbox", { name: "Avoid sea travel" });
    await expect(avoidSea).toBeVisible();
    await expect(avoidSea).not.toBeChecked();
    await avoidSea.check();
    await expect(avoidSea).toBeChecked();
    await expect(enabledTab).toBeEnabled();
    await expect(page.locator("#ruler .directions-route-highlight")).toHaveCount(1);

    // Closing the dialog clears the highlight.
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("#ruler .directions-route-highlight")).toHaveCount(0);
  });

  test("right-clicking a non-burg point keeps the plain distance ruler", async ({
    page,
  }) => {
    const map = page.locator("#map");
    await map.click({ button: "right", position: { x: 900, y: 360 } });
    await expect(
      page.getByRole("menuitem", { name: "Distance from here" })
    ).toBeVisible();
  });
});
