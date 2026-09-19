import { describe, expect, it } from "vitest";
import { createGridDocument, parseDocument } from "../document";
import { defaultGenerationSettings, generateCityOnDocument, generateStageOnDocument } from "../generate";
import type { GenerationSample } from "../generationDiagnostics";
import { facePoints, validate } from "../mesh";
import { validGeneratedCrossings } from "../passages";
import type { CityDocument } from "../types";
import { buildBlockFabric } from "./blockInfill";
import { polygonArea } from "./geom";
import {
  defaultWalledAreaShare,
  MIN_CITY_EXTERNAL_ROADS,
  MIN_FORT_EXTERNAL_ROADS,
  MIN_SETTLEMENT_AREA_SHARE,
  minExternalRoadsForExtent,
  resolveWalledAreaShare,
  SMALL_CITY_EXTENT_METERS
} from "./settlementExtent";

function settledArea(document: CityDocument, kind?: "core" | "outskirts") {
  return Object.values(document.mesh.faces)
    .filter(f => f.properties.buildable && (!kind || f.properties.settlement === kind))
    .reduce((sum, f) => sum + Math.abs(polygonArea(facePoints(document.mesh, f))), 0);
}

describe("wall capacity and extramural housing", () => {
  it("requires two map-edge roads for city sizes and one for Tiny / fort maps", () => {
    expect(SMALL_CITY_EXTENT_METERS).toBe(1200);
    expect([600, 1200, 2400, 4800].map(minExternalRoadsForExtent)).toEqual([
      MIN_FORT_EXTERNAL_ROADS,
      MIN_CITY_EXTERNAL_ROADS,
      MIN_CITY_EXTERNAL_ROADS,
      MIN_CITY_EXTERNAL_ROADS
    ]);
    expect(minExternalRoadsForExtent(SMALL_CITY_EXTENT_METERS - 1)).toBe(MIN_FORT_EXTERNAL_ROADS);
  });

  it("uses size-dependent defaults and bounds explicit capacity", () => {
    expect([600, 1200, 2400, 4800].map(defaultWalledAreaShare)).toEqual([1, 1, 0.45, 0.2]);
    expect(resolveWalledAreaShare(undefined, 4800)).toBe(0.2);
    expect(resolveWalledAreaShare(Number.NaN, 4800)).toBe(0.2);
    expect(resolveWalledAreaShare(0, 4800)).toBe(0.05);
    expect(resolveWalledAreaShare(2, 4800)).toBe(1);
    expect(MIN_SETTLEMENT_AREA_SHARE).toBe(0.45);
    expect(MIN_SETTLEMENT_AREA_SHARE).not.toBe(defaultWalledAreaShare(4800));
  });

  it("does not reject Medium or Large for wall share versus the settlement-area floor", () => {
    const settings = defaultGenerationSettings();
    for (const size of ["medium", "large"] as const) {
      const input = createGridDocument({ size, grid: "evolution", seed: "share-floor" });
      const samples: GenerationSample[] = [];
      const city = generateCityOnDocument(input, settings, "share-floor", sample => samples.push(sample));
      expect(
        samples.filter(sample => sample.failure?.reason === "urban-area-too-small"),
        size
      ).toEqual([]);
      expect(city, size).not.toBeNull();
      expect(city!.fabric!.generation!.settings.walledAreaShare).toBe(size === "medium" ? 0.45 : 0.2);
    }
  });

  it("changes the core capacity without reducing the total built-up area, and ignores it without walls", () => {
    const input = createGridDocument({ size: "large", grid: "evolution", seed: "capacity" });
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    settings.config.coast = "none";
    settings.config.features.walls = true;
    const low = generateStageOnDocument(input, { ...settings, walledAreaShare: 0.2 }, "capacity", 3)!;
    const high = generateStageOnDocument(input, { ...settings, walledAreaShare: 0.7 }, "capacity", 3)!;
    expect(settledArea(low)).toBeCloseTo(settledArea(high), 5);
    expect(settledArea(low, "core")).toBeLessThan(settledArea(high, "core") * 0.4);
    expect(settledArea(low, "outskirts")).toBeGreaterThan(settledArea(high, "outskirts"));
    settings.config.features.walls = false;
    expect(generateStageOnDocument(input, { ...settings, walledAreaShare: 0.2 }, "capacity", 3)).toEqual(
      generateStageOnDocument(input, { ...settings, walledAreaShare: 0.7 }, "capacity", 3)
    );
  });

  for (const terrain of ["inland", "river", "coast"] as const) {
    it(`large ${terrain}: most buildings and local lanes grow outside the core, with valid crossings and saved capacity`, () => {
      const seed = "phase2-reference";
      const input = createGridDocument({ size: "large", grid: "evolution", seed });
      const before = JSON.stringify(input);
      const settings = defaultGenerationSettings();
      settings.config.coast = terrain === "coast" ? "straight" : "none";
      settings.config.rivers = terrain === "river" ? ["through"] : [];
      settings.config.features.port = terrain === "coast";
      const city = generateCityOnDocument(input, settings, seed)!;
      expect(city).not.toBeNull();
      expect(validate(city)).toEqual([]);
      expect(validGeneratedCrossings(city)).toBe(true);
      expect(city.gates.length).toBeGreaterThan(0);
      const fabric = buildBlockFabric(city);
      const outer = fabric.buildings.filter(b => city.mesh.faces[b.faceId].properties.settlement === "outskirts");
      // Core plots are Tiny-scale and fully terraced, so they hold more houses
      // per hectare than the outer belt. Building count still follows the wall.
      expect(outer.length / fabric.buildings.length).toBeGreaterThan(0.55);
      expect(
        fabric.lanes.filter(l => city.mesh.faces[l.faceId].properties.settlement === "outskirts").length
      ).toBeGreaterThan(100);
      expect(settledArea(city, "core") / settledArea(city)).toBeLessThan(0.3);
      expect(city.fabric!.generation!.settings.walledAreaShare).toBe(0.2);
      const loaded = parseDocument(JSON.stringify(city))!;
      expect(loaded).not.toBeNull();
      expect(buildBlockFabric(loaded).buildings).toEqual(fabric.buildings);
      expect(JSON.stringify(input)).toBe(before);
      loaded.fabric!.generation!.settings.walledAreaShare = -1;
      expect(parseDocument(JSON.stringify(loaded))).toBeNull();
    }, 20000);
  }
});
