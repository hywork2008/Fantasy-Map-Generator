import { describe, expect, it } from "vitest";
import { createGridDocument, parseDocument } from "../document";
import { countExternalApproachRoads, defaultGenerationSettings, generateCityOnDocument } from "../generate";
import { DocumentHistory } from "../history";
import { facePoints, validate } from "../mesh";
import { kindEdgeIds, validGeneratedCrossings, vertexHasCrossing } from "../passages";
import { buildBlockFabric } from "./blockInfill";
import { districtDocument, resolveDistricts } from "./fabricDistricts";
import { nearestOnPolyline, pointInPolygon, segmentSegmentHit } from "./geom";
import { minExternalRoadsForExtent } from "./settlementExtent";

describe("evolution complete city", () => {
  for (const seed of ["phase2-reference", "phase2-b", "phase2-c"])
    for (const terrain of ["inland", "river", "coast"] as const) {
      it(`${seed}, ${terrain}: preserves coarse cells and valid gates, bridges and infill`, () => {
        const input = createGridDocument({ size: "small", grid: "evolution", seed });
        const before = JSON.stringify(input);
        const settings = defaultGenerationSettings();
        settings.config.rivers = terrain === "river" ? ["through"] : [];
        settings.config.coast = terrain === "coast" ? "straight" : "none";
        settings.config.features.port = terrain === "coast";
        const city = generateCityOnDocument(input, settings, seed)!;
        expect(city).not.toBeNull();
        expect(validate(city)).toEqual([]);
        expect(validGeneratedCrossings(city)).toBe(true);
        expect(city.gates.length).toBeGreaterThan(0);
        expect(countExternalApproachRoads(city)).toBeGreaterThanOrEqual(
          minExternalRoadsForExtent(city.frame.extentMeters)
        );
        for (const gate of city.gates) expect(vertexHasCrossing(city, gate.vertexId, "wall", "road")).toBe(true);
        const roads = kindEdgeIds(city, "road"),
          walls = kindEdgeIds(city, "wall"),
          rivers = kindEdgeIds(city, "river");
        for (const road of roads) expect(walls.has(road) || rivers.has(road)).toBe(false);
        for (const f of Object.values(city.mesh.faces)) {
          const p = facePoints(city.mesh, f);
          for (let i = 0; i < p.length; i++)
            for (let j = i + 2; j < p.length; j++) {
              if (i === 0 && j === p.length - 1) continue;
              expect(segmentSegmentHit(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length])).toBeNull();
            }
        }
        const skeleton = JSON.stringify(city.mesh);
        const fabric = buildBlockFabric(city);
        expect(fabric.buildings.length).toBeGreaterThan(300);
        const districts = resolveDistricts(city, city.fabric);
        const merged = districtDocument(city, districts);
        for (const building of fabric.buildings) {
          const district = districts.find(d => d.faceIds.includes(building.faceId))!;
          const polygon = facePoints(merged.mesh, merged.mesh.faces[district.id]);
          expect(building.polygon.every(p => pointInPolygon(p, polygon))).toBe(true);
          for (const river of city.featureGroups) {
            if (river.kind !== "river") continue;
            const points = river.vertices.map(v => city.mesh.vertices[v].point);
            for (const point of building.polygon)
              expect(nearestOnPolyline(point, points).dist).toBeGreaterThanOrEqual(river.style.widthMeters / 2 + 2);
          }
        }
        expect(JSON.stringify(city.mesh)).toBe(skeleton);
        expect(Object.keys(city.mesh.faces).length).toBeLessThan(Object.keys(input.mesh.faces).length + 40);
        expect(JSON.stringify(input)).toBe(before);
      });
    }
  it("Small / Medium / Large cities keep at least two map-edge approach roads", () => {
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    for (const size of ["small", "medium", "large"] as const) {
      const input = createGridDocument({ size, grid: "evolution", seed: "roads-two" });
      const city = generateCityOnDocument(input, settings, "roads-two")!;
      expect(city, size).not.toBeNull();
      expect(countExternalApproachRoads(city), size).toBeGreaterThanOrEqual(
        minExternalRoadsForExtent(city.frame.extentMeters)
      );
    }
  });

  it("keeps the same initial cell count across sizes while increasing internal detail", () => {
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    const seed = "phase2-reference";
    const small = createGridDocument({ size: "small", grid: "evolution", seed });
    const large = createGridDocument({ size: "large", grid: "evolution", seed });
    expect(Object.keys(large.mesh.faces)).toEqual(Object.keys(small.mesh.faces));
    const smallCity = generateCityOnDocument(small, settings, seed)!;
    const largeCity = generateCityOnDocument(large, settings, seed)!;
    const before = JSON.stringify(largeCity.mesh);
    const largeFabric = buildBlockFabric(largeCity);
    expect(largeFabric.buildings.length).toBeGreaterThan(buildBlockFabric(smallCity).buildings.length * 5);
    expect(Object.keys(largeCity.mesh.faces).length).toBeLessThan(Object.keys(smallCity.mesh.faces).length + 20);
    expect(JSON.stringify(largeCity.mesh)).toBe(before);
  });
  it("persists the explicit grid policy through saving and history, with deterministic regeneration", () => {
    const input = createGridDocument({ size: "small", grid: "evolution", seed: "persist" });
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    const city = generateCityOnDocument(input, settings, "persist")!;
    const loaded = parseDocument(JSON.stringify(city))!;
    expect(loaded.gridKind).toBe("evolution");
    const recipe = loaded.fabric!.generation!;
    expect(recipe.input).toEqual(input);
    expect(generateCityOnDocument(recipe.input, recipe.settings, recipe.seed)).toEqual(city);
    expect(buildBlockFabric(loaded)).toEqual(buildBlockFabric(city));
    expect(generateCityOnDocument(input, settings, "persist")).toEqual(city);
    const history = new DocumentHistory(input);
    history.commit(city);
    expect(history.undo(city)).toEqual(input);
    expect(history.redo(input)).toEqual(city);
    const legacy = structuredClone(input);
    delete legacy.gridKind;
    expect(parseDocument(JSON.stringify(legacy))?.gridKind).toBeUndefined();
  });
});
