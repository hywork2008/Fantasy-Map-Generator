import { expect, it } from "vitest";
import { citySpatialMetrics } from "./citySpatialMetrics";
import { meshFromCells } from "./mesh";
import type { CityDocument, Point } from "./types";

function fixture(): CityDocument {
  const mesh = meshFromCells(
    [0, 1, 2, 3].map(id => {
      const x = -50 + id * 25;
      const polygon: Point[] = [
        [x, -25],
        [x + 25, -25],
        [x + 25, 25],
        [x, 25]
      ];
      return {
        id,
        polygon,
        site: [x + 12.5, 0] as Point,
        centroid: [x + 12.5, 0] as Point,
        neighbors: [],
        onBorder: true
      };
    })
  );
  mesh.faces.f0.properties.settlement = "core";
  mesh.faces.f1.properties.settlement = "outskirts";
  mesh.faces.f2.properties.settlement = "core";
  mesh.faces.f2.properties.water = "sea";
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 100, cityRadiusMeters: 25, blockSizeMeters: 25 },
    mesh,
    featureGroups: [],
    gates: [],
    elements: []
  };
}

it("separates urban cells, rural/water cells and background beyond the mesh", () => {
  const doc = fixture();
  const before = structuredClone(doc);
  expect(citySpatialMetrics(doc)).toEqual({
    frameExtentMeters: 100,
    frameAreaMeters2: 10000,
    meshAreaMeters2: 5000,
    coreAreaMeters2: 1250,
    outskirtsAreaMeters2: 1250,
    urbanAreaMeters2: 2500,
    backgroundAreaMeters2: 7500,
    urbanFrameRatio: 0.25,
    backgroundFrameRatio: 0.75,
    urbanMeshRatio: 0.5,
    backgroundMeshRatio: 0.5,
    meshFrameRatio: 0.5
  });
  expect(doc).toEqual(before);
});

it("clips cells to the displayed frame and handles concave faces", () => {
  const doc = fixture();
  doc.frame.extentMeters = 50;
  const result = citySpatialMetrics(doc);
  expect(result.frameAreaMeters2).toBe(2500);
  expect(result.meshAreaMeters2).toBe(2500);
  expect(result.urbanAreaMeters2).toBe(1250);
  expect(result.backgroundFrameRatio).toBe(0.5);
  const polygon: Point[] = [
    [-20, -20],
    [20, -20],
    [20, 0],
    [0, 0],
    [0, 20],
    [-20, 20]
  ];
  doc.mesh = meshFromCells([{ id: 0, polygon, site: [-5, -5], centroid: [-5, -5], neighbors: [], onBorder: true }]);
  doc.mesh.faces.f0.properties.settlement = "core";
  expect(citySpatialMetrics(doc).urbanAreaMeters2).toBe(1200);
});

it("reports zero urban area and no mesh ratio when the mesh is empty", () => {
  const doc = fixture();
  doc.mesh = { vertices: {}, edges: {}, faces: {} };
  expect(citySpatialMetrics(doc)).toMatchObject({
    urbanAreaMeters2: 0,
    backgroundFrameRatio: 1,
    urbanMeshRatio: null,
    backgroundMeshRatio: null,
    meshFrameRatio: 0
  });
});
