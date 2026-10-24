import { describe, expect, it } from "vitest";
import { createGridDocument } from "../document";
import { polygonCentroid } from "../geom";
import { facePoints } from "../mesh";
import { cityTerrain } from "../terrainElevation";
import {
  buildTerrainFieldRecipe,
  clearTerrainFieldCache,
  coarseFromHeightfield,
  terrainFieldForDocument
} from "./build";
import { carveRivers, conformWater, fieldFromParts, lowFrequencyError } from "./conform";
import { ROCK_SLOPE } from "./constants";
import { fieldContours, fieldHachures } from "./contours";
import { drawSeamError } from "./drawGrid";
import { lotFitsField, markUnbuildableSlopes } from "./lots";
import { sampleField, sampleGrid, slopeField } from "./sample";
import { createCliffFortressStudy } from "./study";
import { templateParts } from "./templates";

describe("terrain field", () => {
  it("bilinear-samples the lattice and repeats the edge outside it", () => {
    const grid = { origin: [0, 0] as [number, number], sampleMeters: 10, columns: 2, rows: 2 };
    expect(sampleGrid(grid, [0, 10, 20, 40], [5, 5])).toBeCloseTo(17.5, 5);
    expect(sampleGrid(grid, [0, 10, 20, 40], [-20, 5])).toBeCloseTo(sampleGrid(grid, [0, 10, 20, 40], [0, 5]), 5);
  });

  it("rebuilds the same parts from a template and a seed", () => {
    const first = templateParts("crag", 11, 600);
    const second = templateParts("crag", 11, 600);
    expect(second).toEqual(first);
    expect(templateParts("crag", 12, 600)).not.toEqual(first);
  });

  it("keeps a crag summit at least 20 m above the plain and a steep rim", () => {
    const recipe = buildTerrainFieldRecipe({ template: "crag", seed: 11, extentMeters: 600, sampleMeters: 4 });
    const field = fieldFromParts(600, 4, recipe.parts);
    const crag = recipe.parts.find(part => part.kind === "crag");
    expect(crag?.kind).toBe("crag");
    if (crag?.kind !== "crag") return;
    const summit = sampleField(field, crag.center);
    const plain = sampleField(field, [crag.center[0] + 180, crag.center[1]]);
    expect(summit - plain).toBeGreaterThanOrEqual(20);
    let steep = 0;
    let samples = 0;
    const radius = crag.topRadiusMeters + crag.cliffRunMeters * 0.5;
    for (let step = 0; step < 24; step++) {
      const angle = (step / 24) * Math.PI * 2;
      const point: [number, number] = [
        crag.center[0] + Math.cos(angle) * radius,
        crag.center[1] + Math.sin(angle) * radius
      ];
      samples++;
      if (slopeField(field, point) >= Math.tan((60 * Math.PI) / 180)) steep++;
    }
    expect(steep / samples).toBeGreaterThanOrEqual(0.5);
  });

  it("pulls a coarse lattice back toward its own values", () => {
    const elevations = Array.from({ length: 25 }, () => 25);
    const coarse = coarseFromHeightfield(5, 40, elevations);
    expect(coarse).not.toBeNull();
    if (!coarse) return;
    const recipe = buildTerrainFieldRecipe({
      template: "noise",
      seed: 3,
      extentMeters: 160,
      sampleMeters: 4,
      coarse
    });
    const field = fieldFromParts(160, 4, recipe.parts);
    const error = lowFrequencyError(field, coarse);
    expect(Math.max(...error.map(value => Math.abs(value)))).toBeLessThan(4);
  });

  it("carves a river that keeps descending and holds water below its shore", () => {
    const flat = fieldFromParts(200, 4, [{ kind: "offset", meters: 20 }]);
    carveRivers(flat, [
      {
        points: [
          [-60, 0],
          [0, 0],
          [60, 0]
        ],
        widthMeters: 10
      }
    ]);
    const upstream = sampleField(flat, [-60, 0]);
    const downstream = sampleField(flat, [60, 0]);
    expect(downstream).toBeLessThan(upstream);
    const watered = fieldFromParts(200, 4, [{ kind: "offset", meters: 20 }]);
    conformWater(watered, [
      {
        polygon: [
          [-12, -12],
          [12, -12],
          [12, 12],
          [-12, 12]
        ],
        elevation: 5
      }
    ]);
    expect(sampleField(watered, [0, 0])).toBeLessThan(5);
    expect(sampleField(watered, [40, 0])).toBeGreaterThan(5);
  });

  it("leaves a document without a recipe on cell elevations", () => {
    const document = createGridDocument({ size: "micro", grid: "hex", hexSizeMeters: 30, seed: "cells" });
    const terrain = cityTerrain(document);
    expect(terrain.field).toBeUndefined();
    expect(terrain.slopeAt).toBeUndefined();
    expect(terrain.triangles.length).toBeGreaterThan(0);
  });

  it("samples a saved recipe without triangulating the whole frame", () => {
    clearTerrainFieldCache();
    const document = createGridDocument({ size: "micro", grid: "hex", hexSizeMeters: 30, seed: "field" });
    const recipe = buildTerrainFieldRecipe({
      template: "crag",
      seed: 4,
      extentMeters: document.frame.extentMeters,
      sampleMeters: 8
    });
    document.terrain = { version: 1, features: [], field: recipe };
    const terrain = cityTerrain(document, { renderSpacing: 8 });
    const field = terrainFieldForDocument(document);
    expect(field).not.toBeNull();
    expect(terrain.field).toBe(true);
    expect(terrain.heightAt([0, 0])).toBeCloseTo(sampleField(field!, [0, 0]) - terrain.datumMeters, 4);
    expect(terrain.triangles.length).toBe(0);
    const grid = terrain.grid;
    expect(grid?.sampleMeters).toBe(8);
    expect(grid && drawSeamError(grid, terrain.heightAt).p95).toBeLessThan(0.05);
    expect(fieldContours(field!).length).toBeGreaterThan(0);
    expect(fieldHachures(field!).length).toBeGreaterThan(0);
  });

  it("balances a lot on the median and rejects a cliff", () => {
    const ring: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ];
    const document = createGridDocument({ size: "micro", grid: "hex", hexSizeMeters: 40, seed: "lots" });
    const heightAt = (point: [number, number]) => point[0] * 0.1;
    const level = heightAt(polygonCentroid(ring));
    const terrain = {
      datumMeters: 0,
      relief: true,
      field: true as const,
      heightAt,
      slopeAt: () => 0.4,
      surfaceAt: heightAt,
      foundationAt: () => level,
      triangles: [],
      ramps: []
    };
    expect(lotFitsField(document, terrain, { polygon: ring, faceId: "missing" })).toBe(false);
    terrain.slopeAt = () => 0.02;
    expect(lotFitsField(document, terrain, { polygon: ring, faceId: "missing" })).toBe(true);
  });

  it("keeps castle ground buildable when the slope is past 35%", () => {
    const document = createGridDocument({ size: "micro", grid: "hex", hexSizeMeters: 40, seed: "castle-slope" });
    const face = Object.values(document.mesh.faces)[0];
    face.properties.water = "land";
    face.properties.ward = "castle";
    face.properties.buildable = true;
    markUnbuildableSlopes(document, () => 0.9);
    expect(face.properties.buildable).toBe(true);
    expect(face.properties.ward).toBe("castle");
  });

  it("is gentler behind a spur root than on the cliff side", () => {
    const recipe = buildTerrainFieldRecipe({ template: "spur", seed: 2, extentMeters: 600, sampleMeters: 4 });
    const field = fieldFromParts(600, 4, recipe.parts);
    const spur = recipe.parts.find(part => part.kind === "spur");
    expect(spur?.kind).toBe("spur");
    if (spur?.kind !== "spur") return;
    const axisX = spur.tip[0] - spur.root[0];
    const axisY = spur.tip[1] - spur.root[1];
    const length = Math.hypot(axisX, axisY) || 1;
    const back: [number, number] = [spur.root[0] - (axisX / length) * 40, spur.root[1] - (axisY / length) * 40];
    const side: [number, number] = [
      (spur.root[0] + spur.tip[0]) / 2 + (-axisY / length) * (spur.topWidthMeters / 2 + 4),
      (spur.root[1] + spur.tip[1]) / 2 + (axisX / length) * (spur.topWidthMeters / 2 + 4)
    ];
    expect(slopeField(field, back)).toBeLessThan(ROCK_SLOPE);
    expect(slopeField(field, side)).toBeGreaterThan(slopeField(field, back));
  });

  it("raises a cliff-edged castle on the study crag and keeps ordinary steep ground empty", () => {
    const document = createCliffFortressStudy();
    const terrain = cityTerrain(document);
    const platform = document.terrain?.features.find(feature => feature.kind === "platform");
    expect(platform?.edge.kind).toBe("cliff");
    expect(document.terrain?.field?.template).toBe("crag");
    const town = sampleField(terrainFieldForDocument(document)!, [220, 180]);
    expect(platform!.levelMeters - town).toBeGreaterThanOrEqual(20);
    const ramp = document.terrain?.ramps?.[0];
    expect(ramp).toBeTruthy();
    if (ramp)
      for (let i = 1; i < ramp.centerline.length; i++) {
        const run = Math.hypot(
          ramp.centerline[i][0] - ramp.centerline[i - 1][0],
          ramp.centerline[i][1] - ramp.centerline[i - 1][1]
        );
        const rise = Math.abs(ramp.elevationsMeters[i] - ramp.elevationsMeters[i - 1]);
        expect(rise).toBeLessThanOrEqual(0.08 * run + 0.05);
      }
    const castleFaces = new Set(platform && platform.summit.kind === "faces" ? platform.summit.faceIds : []);
    for (const face of Object.values(document.mesh.faces)) {
      if (face.properties.water !== "land" || castleFaces.has(face.id)) continue;
      const center = polygonCentroid(facePoints(document.mesh, face));
      if ((terrain.slopeAt?.(center) ?? 0) > 0.35) expect(face.properties.buildable).toBe(false);
    }
    const castleFace = [...castleFaces][0];
    const ring = facePoints(document.mesh, document.mesh.faces[castleFace]);
    const pad = terrain.foundationAt(ring);
    expect(Math.abs(pad - (platform!.levelMeters - terrain.datumMeters))).toBeLessThan(0.2);
    expect(terrain.triangles.some(patch => patch.escarpment)).toBe(true);
    expect(terrain.triangles.length).toBeLessThan(Object.keys(document.mesh.faces).length * 8);
  });
});
