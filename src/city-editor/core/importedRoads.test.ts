import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import { featureGroupVertices } from "./features";
import input from "./fixtures/autruyles-20261003.json";
import { normalizeApproachBeyond } from "./gen/approachBeyond";
import { buildCityBuildings } from "./gen/buildingLots";
import { vecToAzimuth } from "./gen/geom";
import { importedRoadsForSite } from "./gen/site/importedRoads";
import { siteToGeography } from "./gen/site/siteInput";
import { farNodeFor } from "./gen/streets";
import { countExternalApproachRoads, generateCityOnDocument, generateGateStep } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import type { Point } from "./types";

function share() {
  return parseIncomingPayload(JSON.stringify(input))!;
}
describe("FMG external road count", () => {
  it("reproduces Autruyles with one southwestern source road and no extra approaches", () => {
    const value = share(),
      settings = cityEditorSettings(value),
      source = cityEditorDocument(value);
    expect(generateGateStep(source, settings, value.seed, 999).total).toBe(1);
    const city = generateCityOnDocument(source, settings, value.seed)!;
    expect(city).toBeTruthy();
    const roads = city.featureGroups.filter(g => g.kind === "road" && g.sourceRoad);
    expect(roads).toHaveLength(1);
    expect(roads[0]).toMatchObject({ sourceRoad: { index: 0, routeId: 291 } });
    expect(countExternalApproachRoads(city)).toBe(1);
    expect(normalizeApproachBeyond(roads[0].beyond)?.settlement.burgId).toBe(19);
    const points = featureGroupVertices(city, roads[0]).map(id => city.mesh.vertices[id].point);
    expect(Math.abs(vecToAzimuth(...points[0]) - 237.3)).toBeLessThan(15);
    expect(buildCityBuildings(city).length).toBeGreaterThan(0);
    const localRoads = city.featureGroups.filter(group => group.kind === "road" && !group.sourceRoad);
    for (const group of localRoads) {
      const points = featureGroupVertices(city, group).map(id => city.mesh.vertices[id].point);
      expect(
        points.every(point => Math.max(Math.abs(point[0]), Math.abs(point[1])) < city.frame.extentMeters / 2)
      ).toBe(true);
    }
  });
  it.each([0, 2, 7])("preserves %i FMG land roads without the standalone minimum or gate ceiling", count => {
    const value = share();
    const road = value.descriptor!.roads[0];
    value.descriptor!.roads = Array.from({ length: count }, (_, i) => {
      const angle = (((i * 360) / count) * Math.PI) / 180;
      const end: Point = [Math.sin(angle) * 750, Math.cos(angle) * 750];
      return { ...structuredClone(road), routeId: 100 + i, entryAzimuthDeg: (i * 360) / count, path: [[0, 0], end] };
    });
    value.descriptor!.suggestedGates = count;
    const settings = cityEditorSettings(value),
      source = cityEditorDocument(value);
    expect(generateGateStep(source, settings, value.seed, 999).total).toBe(count);
    const city = generateCityOnDocument(source, settings, value.seed)!;
    expect(city).toBeTruthy();
    expect(city.featureGroups.filter(g => g.kind === "road" && g.sourceRoad)).toHaveLength(count);
    expect(countExternalApproachRoads(city)).toBe(count);
    expect(buildCityBuildings(city).length).toBeGreaterThan(0);
  });
  it.each(["organic", "bram", "circulade"] as const)("preserves the source road in a walled %s settlement", layout => {
    const value = share();
    value.descriptor!.burg.walls = true;
    value.settings.layout = layout;
    value.settings.config.layout = layout;
    const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed)!;
    expect(city).toBeTruthy();
    expect(city.featureGroups.filter(group => group.kind === "road" && group.sourceRoad)).toHaveLength(1);
    expect(countExternalApproachRoads(city)).toBe(1);
  });
  it("clips the source path to a fitted frame and never uses radial fallback", () => {
    const value = share(),
      site = value.descriptor!;
    const roads = importedRoadsForSite(site);
    expect(roads[0].path.at(-1)![0]).toBe(-300);
    expect(roads[0].path.at(-1)![1]).toBeCloseTo(-192.92);
    const endpoint = farNodeFor(
      { point: [100, 100], borderIndex: 0, water: false, roadIndex: 0 },
      siteToGeography(site, true),
      300,
      null,
      null,
      30,
      true,
      "radial",
      0
    );
    expect(endpoint).toEqual(roads[0].path.at(-1));
  });
  it("excludes sea routes and preserves a source road that ends locally", () => {
    const value = share(),
      site = value.descriptor!;
    site.roads.push({ ...structuredClone(site.roads[0]), group: "searoutes", routeId: 999 });
    site.roads[0].path = [
      [0, 0],
      [180, 0]
    ];
    site.roads[0].reachesEdge = false;
    expect(importedRoadsForSite(site)).toEqual([
      {
        sourceIndex: 0,
        routeId: 291,
        path: [
          [0, 0],
          [180, 0]
        ]
      }
    ]);
  });
  it("keeps the current standalone entrance policy separate", () => {
    const value = share();
    delete value.descriptor;
    value.settings.config.features.walls = false;
    value.settings.config.rivers = [];
    const source = cityEditorDocument(value),
      settings = cityEditorSettings(value);
    expect(generateGateStep(source, settings, value.seed, 999).total).toBeGreaterThanOrEqual(3);
  });
});
