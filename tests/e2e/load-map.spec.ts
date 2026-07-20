import { test, expect } from "@playwright/test";
import {
  loadMapFile,
  collectPageErrors,
  filterCriticalErrors,
  getMapDataSummary,
  getSvgLayerPresence,
  getPackStatesSummary,
  getPackBurgsSummary,
} from "./helpers/fmg-helpers";

test.describe("Map loading", () => {
  test("should load a saved map file", async ({ page }) => {
    const errors = collectPageErrors(page);
    await loadMapFile(page, "demo.map", "svg");

    const mapData = await getMapDataSummary(page);
    expect(mapData.hasStates).toBe(true);
    expect(mapData.hasBurgs).toBe(true);
    expect(mapData.hasCells).toBe(true);
    expect(mapData.hasRivers).toBe(true);
    expect(mapData.mapId).toBeDefined();

    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  test("loaded map should have correct SVG structure", async ({ page }) => {
    const errors = collectPageErrors(page);
    await loadMapFile(page, "demo.map", "svg");

    const layers = await getSvgLayerPresence(page);
    expect(layers.ocean).toBe(true);
    expect(layers.lakes).toBe(true);
    expect(layers.coastline).toBe(true);
    expect(layers.rivers).toBe(true);
    expect(layers.borders).toBe(true);
    expect(layers.burgs).toBe(true);
    expect(layers.labels).toBe(true);

    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  test("loaded map should preserve state data", async ({ page }) => {
    const errors = collectPageErrors(page);
    await loadMapFile(page, "demo.map", "svg");

    const statesData = await getPackStatesSummary(page);
    expect(statesData.count).toBeGreaterThan(0);
    expect(statesData.allHaveNames).toBe(true);
    expect(statesData.allHaveCells).toBe(true);
    expect(statesData.allHaveArea).toBe(true);

    expect(filterCriticalErrors(errors)).toEqual([]);
  });

  test("loaded map should preserve burg data", async ({ page }) => {
    const errors = collectPageErrors(page);
    await loadMapFile(page, "demo.map", "svg");

    const burgsData = await getPackBurgsSummary(page);
    expect(burgsData.count).toBeGreaterThan(0);
    expect(burgsData.allHaveNames).toBe(true);
    expect(burgsData.allHaveCoords).toBe(true);
    expect(burgsData.allHaveCells).toBe(true);

    expect(filterCriticalErrors(errors)).toEqual([]);
  });
});
