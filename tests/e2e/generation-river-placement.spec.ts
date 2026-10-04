import { expect, test } from "@playwright/test";
import { collectPageErrors, filterCriticalErrors, waitForMapGeneration } from "./helpers/fmg-helpers";

test("generates the entire map with all built-in extensions disabled", async ({ page }) => {
  test.setTimeout(120000);
  const errors = collectPageErrors(page);
  await page.goto("/?seed=river-placement-responsive&width=1280&height=720");
  await expect(page.getByRole("button", { name: "Generate entire map", exact: true })).toBeVisible();
  await page.locator("#extensionsTab").click();
  for (const name of ["Characters", "Economy, Goods & Trade", "Nobility & Characters", "Shipbuilding"]) {
    await page.getByRole("checkbox", { name: `Toggle ${name} extension`, exact: true }).uncheck();
  }
  await waitForMapGeneration(page, 110000);
  const counts = await page.evaluate(() => ({
    rivers: window.fmg.world.pack.rivers.length,
    placedOrDiagnosed: window.fmg.world.pack.burgs.filter(b => b.i && b.riverSiteStatus).length
  }));
  expect(counts.rivers).toBeGreaterThan(0);
  expect(counts.placedOrDiagnosed).toBeGreaterThan(0);
  expect(filterCriticalErrors(errors)).toEqual([]);
});
