import { describe, expect, it } from "vitest";
import { stairStructures } from "../renderers/terrainMassing";
import type { CityDocument } from "../types/document";
import { buildBlockFabric } from "./blockInfill";
import { createGridDocument } from "./document";
import { generateCityOnDocument } from "./generation/generateCity";
import { defaultGenerationSettings } from "./generation/settings";
import { polygonCentroid } from "./geom";
import { facePoints } from "./mesh";
import { STAIR_RISER_METERS } from "./roadGrading";
import { planTerraces } from "./terracePlanning";
import { cityTerrain } from "./terrainElevation";
import { collectTownRoads } from "./townRoads";

/** Ground rising 1 m every 10 m eastward. */
const eastward = (point: [number, number]) => point[0] / 10;

describe("terraces", () => {
  it("levels every cell flat on nested terraces one step apart", () => {
    const doc = createGridDocument({ size: "micro", grid: "hex", hexSizeMeters: 20, seed: "terraces" });
    const terraces = planTerraces(doc, eastward, 4);
    expect(terraces.length).toBeGreaterThan(1);
    for (let k = 1; k < terraces.length; k++) {
      const lower = new Set(terraces[k - 1].summit.kind === "faces" ? terraces[k - 1].summit.faceIds : []);
      const upper = terraces[k].summit.kind === "faces" ? terraces[k].summit.faceIds : [];
      expect(upper.every(id => lower.has(id))).toBe(true);
      expect(terraces[k].levelMeters - terraces[k - 1].levelMeters).toBeCloseTo(4, 6);
    }
    const levelled: CityDocument = { ...doc, terrain: { version: 1, features: terraces } };
    const terrain = cityTerrain(levelled);
    const top = Math.max(...Object.values(doc.mesh.faces).map(face => face.properties.elevation));
    const lowest = Math.min(
      ...Object.values(doc.mesh.faces).map(face => eastward(polygonCentroid(facePoints(doc.mesh, face))))
    );
    for (const face of Object.values(doc.mesh.faces)) {
      const center = polygonCentroid(facePoints(doc.mesh, face));
      const step = Math.floor((eastward(center) - lowest) / 4);
      expect(terrain.heightAt(center) + terrain.datumMeters).toBeCloseTo(top + step * 4, 6);
    }
    // Retaining walls are faces of their own, and nothing else on the terraces is steep.
    expect(terrain.triangles.some(patch => patch.escarpment)).toBe(true);
  });
  it("climbs the retaining walls by stairs built out from them, never cutting the terraces", () => {
    const doc = createGridDocument({ size: "micro", grid: "hex", hexSizeMeters: 20, seed: "terraces" });
    const levelled: CityDocument = { ...doc, terrain: { version: 1, features: planTerraces(doc, eastward, 4) } };
    const plain = cityTerrain(levelled);
    const lane = {
      centerline: [
        [-60, 3],
        [60, 3]
      ] as [number, number][],
      widthMeters: 3,
      surface: "earth" as const
    };
    const terrain = cityTerrain(levelled, { roads: [{ ...lane, gradeClass: "lane" }] });
    const stairs = terrain.roads!.stairs;
    expect(stairs.length).toBeGreaterThan(0);
    for (const flight of stairs)
      flight.centerline.forEach((point, i) => {
        expect(flight.elevations[i]).toBeGreaterThanOrEqual(plain.heightAt(point) - 1e-6);
      });
    // The ground stays as levelled; the steps stand on it.
    for (let x = -60; x <= 60; x += 2.5) expect(terrain.heightAt([x, 3])).toBeCloseTo(plain.heightAt([x, 3]), 6);
    const steps = stairStructures(terrain);
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) expect(step.heightMeters).toBeGreaterThan(0);
    const rise = Math.max(
      ...stairs.map(f => Math.max(...f.elevations.slice(1).map((z, i) => Math.abs(z - f.elevations[i]))))
    );
    expect(rise / Math.ceil(rise / STAIR_RISER_METERS)).toBeLessThanOrEqual(STAIR_RISER_METERS);
    // A cart road becomes a stepped street in a terraced town as well.
    expect(cityTerrain(levelled, { roads: [lane] }).roads!.stairs.length).toBeGreaterThan(0);
  });
  it("terraces a generated hilltop town and keeps its fields", () => {
    const generate = (terraces: boolean) => {
      const settings = defaultGenerationSettings();
      settings.config.relief = true;
      if (terraces) settings.terraces = { stepMeters: 4 };
      return generateCityOnDocument(
        createGridDocument({ size: "tiny", grid: "voronoi", seed: "terrace-tiny" }),
        settings,
        "terrace-tiny"
      )!;
    };
    const terraced = generate(true),
      natural = generate(false);
    expect(terraced.terrain?.features.filter(feature => feature.role === "terrace").length).toBeGreaterThan(3);
    expect(natural.terrain).toBeUndefined();
    expect(buildBlockFabric(terraced).farms.length).toBe(buildBlockFabric(natural).farms.length);
    const terrain = cityTerrain(terraced, { roads: collectTownRoads(terraced, buildBlockFabric(terraced).lanes) });
    expect(terrain.roads!.stairs.length).toBeGreaterThan(0);
  }, 120000);
});
