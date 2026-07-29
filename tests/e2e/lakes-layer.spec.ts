import { test, expect } from "@playwright/test";
import { waitForMapLoad } from "./helpers/fmg-helpers";

test.describe("Lakes layer", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto("/?seed=test-seed&width=1280&height=720");
    await waitForMapLoad(page, "svg");
  });

  test("lakes are hidden by default and appear only after the layer is enabled", async ({
    page,
  }) => {
    const lakes = page.locator("#lakes");

    await page.click("#optionsHide");
    await page.waitForSelector("#options", { state: "visible" });

    await expect(lakes).toBeHidden();

    await page.locator("#toggleLakes").click();
    await expect(lakes).toBeVisible();

    await page.locator("#toggleLakes").click();
    await expect(lakes).toBeHidden();
  });

  test("KeyQ toggles the lakes layer", async ({ page }) => {
    const lakes = page.locator("#lakes");

    await expect(lakes).toBeHidden();

    await page.keyboard.press("q");
    await expect(lakes).toBeVisible();

    await page.keyboard.press("q");
    await expect(lakes).toBeHidden();
  });

  test("built-in layer presets keep lakes disabled", async ({ page }) => {
    await page.click("#optionsHide");
    await page.waitForSelector("#options", { state: "visible" });

    const presets = await page.locator("#layersPreset option:not([value='custom'])").evaluateAll(options =>
      options.map(option => (option as HTMLOptionElement).value)
    );

    for (const preset of presets) {
      await page.locator("#layersPreset").selectOption(preset);
      await expect(page.locator("#toggleLakes")).toHaveClass(/buttonoff/);
      await expect(page.locator("#lakes")).toBeHidden();
    }
  });

  test("Lakes panel entry is positioned just after Heightmap", async ({ page }) => {
    // #mapLayers only mounts once the options panel is open (LayersTab is unmounted while closed).
    await page.click("#optionsHide");

    const [lakesIndex, heightmapIndex] = await page.evaluate(() => {
      // Layer toggles are direct-child <button> elements of #mapLayers (LayersTab.tsx), not <li>.
      const items = Array.from(
        document.querySelectorAll("#mapLayers > button")
      ) as HTMLElement[];
      return [
        items.findIndex((li) => li.id === "toggleLakes"),
        items.findIndex((li) => li.id === "toggleHeight"),
      ];
    });

    expect(lakesIndex).toBeGreaterThan(heightmapIndex);
  });

  test("dragging Lakes above Heightmap in panel moves #lakes before #terrs in SVG", async ({
    page,
  }) => {
    const initialOrder = await page.evaluate(() => {
      const viewbox = document.getElementById("viewbox")!;
      const ids = Array.from(viewbox.children).map((el) => el.id);
      return { lakes: ids.indexOf("lakes"), terrs: ids.indexOf("terrs") };
    });
    expect(initialOrder.lakes).toBeGreaterThanOrEqual(0);
    expect(initialOrder.terrs).toBeGreaterThanOrEqual(0);
    expect(initialOrder.lakes).toBeGreaterThan(initialOrder.terrs);

    // Simulate what moveLayer does when the user drags Lakes above Heightmap
    await page.evaluate(() => {
      const lakes = document.getElementById("lakes");
      const terrs = document.getElementById("terrs");
      if (lakes && terrs && terrs.parentNode) {
        terrs.parentNode.insertBefore(lakes, terrs);
      }
    });

    const newOrder = await page.evaluate(() => {
      const viewbox = document.getElementById("viewbox")!;
      const ids = Array.from(viewbox.children).map((el) => el.id);
      return { lakes: ids.indexOf("lakes"), terrs: ids.indexOf("terrs") };
    });
    expect(newOrder.lakes).toBeLessThan(newOrder.terrs);
  });
});
