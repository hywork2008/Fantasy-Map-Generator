import { test, expect } from "@playwright/test";
import {
  waitForMapLoad,
  createTestZone,
  createHiddenTestZone,
  createEmptyTestZone,
  getGeoJsonZones,
  getZoneById,
} from "./helpers/fmg-helpers";

test.describe("Zone Export", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto("/?seed=test-zones-export&width=1280&height=720");
    await waitForMapLoad(page, "svg");
  });

  test("should export zone with valid GeoJSON root structure", async ({ page }) => {
    const zoneId = await createTestZone(page);
    expect(zoneId).toBeGreaterThanOrEqual(0);

    const geoJson = (await getGeoJsonZones(page)) as {
      type: string;
      features: Array<{
        type: string;
        geometry: { type: string; coordinates: number[][][] };
        properties: {
          id: number;
          name: string;
          type: string;
          color: string;
          cells: number[];
        };
      }>;
    };

    // Validate root GeoJSON structure
    expect(geoJson).toHaveProperty("type", "FeatureCollection");
    expect(Array.isArray(geoJson.features)).toBe(true);
    expect(geoJson.features.length).toBeGreaterThan(0);

    const testZoneFeature = geoJson.features.find((f) => f.properties.id === zoneId);
    expect(testZoneFeature).toBeDefined();
    expect(testZoneFeature!.properties.name).toBe("Test Export Zone");

    // Validate Feature structure
    expect(testZoneFeature!.type).toBe("Feature");
    expect(testZoneFeature!.geometry).toBeDefined();
    // Contiguous BFS-selected cells produce a single Polygon
    expect(testZoneFeature!.geometry.type).toBe("Polygon");
    expect(Array.isArray(testZoneFeature!.geometry.coordinates)).toBe(true);
    expect(testZoneFeature!.properties).toBeDefined();

    // Validate zone property mapping against pack.zones
    const testZone = (await getZoneById(page, zoneId)) as {
      i: number;
      name: string;
      type: string;
      color: string;
      cells: number[];
    } | null;
    expect(testZone).not.toBeNull();

    expect(testZoneFeature!.properties.id).toBe(testZone!.i);
    expect(testZoneFeature!.properties.name).toBe(testZone!.name);
    expect(testZoneFeature!.properties.type).toBe(testZone!.type);
    expect(testZoneFeature!.properties.color).toBe(testZone!.color);
    expect(testZoneFeature!.properties.cells).toEqual(testZone!.cells);

    // Validate coordinate array structure
    const { coordinates } = testZoneFeature!.geometry;
    expect(coordinates.length).toBeGreaterThan(0);

    for (const linearRing of coordinates) {
      expect(Array.isArray(linearRing)).toBe(true);
      // GeoJSON requires at least 4 positions in a LinearRing
      expect(linearRing.length).toBeGreaterThanOrEqual(4);

      // First and last positions must be identical (closed ring)
      const first = linearRing[0];
      const last = linearRing[linearRing.length - 1];
      expect(first[0]).toBe(last[0]);
      expect(first[1]).toBe(last[1]);

      for (const position of linearRing) {
        expect(Array.isArray(position)).toBe(true);
        expect(position.length).toBe(2);
        expect(typeof position[0]).toBe("number");
        expect(typeof position[1]).toBe("number");
        // Valid longitude
        expect(position[0]).toBeGreaterThanOrEqual(-180);
        expect(position[0]).toBeLessThanOrEqual(180);
        // Valid latitude
        expect(position[1]).toBeGreaterThanOrEqual(-90);
        expect(position[1]).toBeLessThanOrEqual(90);
      }
    }
  });

  test("should exclude hidden zones from GeoJSON export", async ({ page }) => {
    const regularZoneId = await createTestZone(page);
    expect(regularZoneId).toBeGreaterThanOrEqual(0);

    const hiddenZoneId = await createHiddenTestZone(page);
    expect(hiddenZoneId).toBeGreaterThanOrEqual(0);

    const geoJson = (await getGeoJsonZones(page)) as {
      features: Array<{ properties: { id: number; name: string } }>;
    };

    const regularZoneFeature = geoJson.features.find(
      (f) => f.properties.id === regularZoneId
    );
    expect(regularZoneFeature).toBeDefined();
    expect(regularZoneFeature!.properties.name).toBe("Test Export Zone");

    const hiddenZoneFeature = geoJson.features.find(
      (f) => f.properties.id === hiddenZoneId
    );
    expect(hiddenZoneFeature).toBeUndefined();
  });

  test("should exclude zones with empty cells array from GeoJSON export", async ({
    page,
  }) => {
    const regularZoneId = await createTestZone(page);
    expect(regularZoneId).toBeGreaterThanOrEqual(0);

    const emptyZoneId = await createEmptyTestZone(page);
    expect(emptyZoneId).toBeGreaterThanOrEqual(0);

    const geoJson = (await getGeoJsonZones(page)) as {
      features: Array<{ properties: { id: number; name: string } }>;
    };

    const regularZoneFeature = geoJson.features.find(
      (f) => f.properties.id === regularZoneId
    );
    expect(regularZoneFeature).toBeDefined();
    expect(regularZoneFeature!.properties.name).toBe("Test Export Zone");

    const emptyZoneFeature = geoJson.features.find(
      (f) => f.properties.id === emptyZoneId
    );
    expect(emptyZoneFeature).toBeUndefined();
  });
});
