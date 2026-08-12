import { expect, test } from "@playwright/test";
import {
  ensureLayerOn,
  getGridAnnualAverageTemp,
  getGridSeasonalTemp,
  getSimulationClock,
  getWebglDeckLayerIds,
  waitForMapLoad
} from "./helpers/fmg-helpers";

// See docs/plan/seasonal-temperature-variation.md. Unit tests already cover the underlying
// math in isolation (src/utils/seasonUtils.test.ts, src/generators/seasonalClimate.test.ts);
// these specs confirm the wiring works end-to-end in a real running app — generation,
// SVG/WebGL rendering, and the tick-driven monthly recompute.

test("renders seasonally-adjusted temperature isotherms in SVG mode", async ({ page }) => {
  await page.goto("/?seed=seasonal-temp-svg&width=1280&height=720");
  await waitForMapLoad(page, "svg");

  await ensureLayerOn(page, "toggleTemperature");
  const temperature = page.locator("#temperature");
  await expect(temperature).not.toHaveClass(/fmg-layer-hidden/);
  await expect(temperature.locator("path").first()).toBeAttached();

  const annualAverageTemp = await getGridAnnualAverageTemp(page);
  const seasonalTemp = await getGridSeasonalTemp(page);
  expect(seasonalTemp).not.toBeNull();
  expect(seasonalTemp).toHaveLength(annualAverageTemp.length);
  expect(seasonalTemp!.some((value, i) => value !== annualAverageTemp[i])).toBe(true);
});

test("renders the temperature layer in the default webglHybrid renderer without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", msg => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/?seed=seasonal-temp-webgl&width=1280&height=720");
  await waitForMapLoad(page, "webglHybrid");

  await ensureLayerOn(page, "toggleTemperature");
  await expect.poll(() => getWebglDeckLayerIds(page)).toContain("fmg-webgl-temperature");

  const seasonalTemp = await getGridSeasonalTemp(page);
  expect(seasonalTemp).not.toBeNull();
  expect(errors, `console/page errors: ${errors.join("\n")}`).toEqual([]);
});

test("recomputes grid.cells.seasonalTemp as the live simulation calendar advances to a new month", async ({
  page
}) => {
  await page.goto("/?seed=seasonal-temp-advance&width=1280&height=720");
  await waitForMapLoad(page, "svg");

  const before = await getGridSeasonalTemp(page);
  const beforeClock = await getSimulationClock(page);
  expect(before).not.toBeNull();

  // Drive the Advance Time dialog's "Advance Month" control (defaults to 1 month) through the
  // DOM, matching AGENTS.md §5 — window.fmg is for setup/assertions, not for driving the
  // interaction itself.
  await page.locator("#stickedAdvanceTimeButton").click();
  await page
    .locator(`[data-tip="Click to advance the world's simulation clock by a number of months"]`)
    .click();

  await expect.poll(async () => (await getSimulationClock(page)).currentMonth).not.toBe(beforeClock.currentMonth);

  const after = await getGridSeasonalTemp(page);
  expect(after).not.toBeNull();
  expect(after!.some((value, i) => value !== before![i])).toBe(true);
});
