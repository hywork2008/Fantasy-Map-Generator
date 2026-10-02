import { expect, it } from "vitest";
import { featureGroupVertices } from "./features";
import fixture from "./fixtures/river-wall-diagonal-20261002.json";
import dryChordFixture from "./fixtures/river-wall-dry-chord-20261002.json";
import { isSimplePolygon, polygonCentroid } from "./gen/geom";
import { edgeBetween, facePoints, faceVertices, incidentFaces, meshFromCells, validate } from "./mesh";
import { kindEdgeIds, vertexHasCrossing } from "./passages";
import { repairRiverWalls } from "./riverWallRouting";
import type { CityDocument, Point } from "./types";

// Geometry from ce-generation-failure-20261002-154641.svg (seed 1ut3dv1).
function input(geometry: Pick<typeof fixture, "faces" | "features"> = fixture) {
  const mesh = meshFromCells(
    geometry.faces.map((face, id) => {
      const polygon = face.polygon as Point[];
      const center = polygonCentroid(polygon);
      return { id, polygon, centroid: center, site: center, neighbors: [], onBorder: false };
    })
  );
  geometry.faces.forEach((face, id) => {
    mesh.faces[`f${id}`].properties.buildable = face.buildable;
  });
  const vertexAt = (point: number[]) =>
    Object.values(mesh.vertices).find(v => Math.hypot(v.point[0] - point[0], v.point[1] - point[1]) < 1e-7)!.id;
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 600, cityRadiusMeters: 198, blockSizeMeters: 50 },
    mesh,
    gates: [],
    elements: [],
    featureGroups: geometry.features.map(feature => {
      const vertices = feature.points.map(vertexAt);
      const common = {
        id: `gc:${feature.kind}-0`,
        name: feature.kind,
        locked: false,
        style: { widthMeters: feature.widthMeters }
      };
      return feature.kind === "river"
        ? { ...common, kind: "river", vertices }
        : {
            ...common,
            kind: "wall",
            segments: vertices.slice(1).map((b, i) => {
              const edge = edgeBetween(mesh, vertices[i], b)!;
              return { edgeId: edge.id, forward: edge.a === vertices[i] };
            })
          };
    })
  };
  const urbanRegions = Object.values(mesh.faces)
    .filter(f => f.properties.buildable)
    .map(f => facePoints(mesh, f));
  return { document, urbanRegions, vertexAt };
}

it("cuts v55–v57 to bypass v56 and crosses through the existing v57–v58 wall arm", () => {
  const { document, urbanRegions, vertexAt } = input();
  const before = structuredClone(document);
  const v55 = vertexAt(fixture.locations.v55);
  const v56 = vertexAt(fixture.locations.v56);
  const v57 = vertexAt(fixture.locations.v57);
  const v58 = vertexAt(fixture.locations.v58);
  expect(edgeBetween(document.mesh, v55, v57)).toBeNull();
  const repair = repairRiverWalls(document, urbanRegions);
  expect(repair.issues).toEqual([]);
  expect(repair.splitFaces).toBe(1);
  expect(repair.preparedPassages).toEqual([v57]);
  expect(validate(repair.document)).toEqual([]);
  expect(document).toEqual(before);
  const walls = kindEdgeIds(repair.document, "wall");
  expect(walls.has(edgeBetween(repair.document.mesh, v55, v57)!.id)).toBe(true);
  expect(walls.has(edgeBetween(repair.document.mesh, v57, v58)!.id)).toBe(true);
  expect(walls.has(edgeBetween(repair.document.mesh, v56, v57)!.id)).toBe(false);
  expect(vertexHasCrossing(repair.document, v57, "wall", "river")).toBe(true);
  const wall = repair.document.featureGroups.find(g => g.kind === "wall")!;
  const vertices = featureGroupVertices(repair.document, wall);
  expect(vertices).not.toContain(v56);
  expect(vertices[0]).toBe(vertices.at(-1));
  expect(isSimplePolygon(vertices.slice(0, -1).map(id => repair.document.mesh.vertices[id].point))).toBe(true);
  const river = document.featureGroups.find(g => g.kind === "river")!;
  expect(repair.document.featureGroups.find(g => g.id === river.id)).toEqual(river);
  for (const id of river.vertices) expect(repair.document.mesh.vertices[id]).toEqual(document.mesh.vertices[id]);
  // Another routing pass must retain the consumed oblique crossing.
  const repeated = repairRiverWalls(repair.document, urbanRegions);
  expect(repeated.issues).toEqual([]);
  expect(repeated.splitFaces).toBe(0);
  expect(kindEdgeIds(repeated.document, "wall")).toEqual(walls);
});

it("cuts v68–v101 to bypass river vertex v100 without opening another river passage", () => {
  // Geometry from ce-generation-failure-20261002-155853.svg (seed 1a72bf7).
  const { document, urbanRegions, vertexAt } = input(dryChordFixture);
  const before = structuredClone(document);
  const v68 = vertexAt(dryChordFixture.locations.v68);
  const v100 = vertexAt(dryChordFixture.locations.v100);
  const v101 = vertexAt(dryChordFixture.locations.v101);
  expect(edgeBetween(document.mesh, v68, v101)).toBeNull();
  const repair = repairRiverWalls(document, urbanRegions);
  expect(repair.issues).toEqual([]);
  expect(repair.splitFaces).toBe(1);
  expect(repair.preparedPassages).toEqual([]);
  expect(validate(repair.document)).toEqual([]);
  expect(document).toEqual(before);
  const walls = kindEdgeIds(repair.document, "wall");
  expect(walls.has(edgeBetween(repair.document.mesh, v68, v101)!.id)).toBe(true);
  expect(walls.has(edgeBetween(repair.document.mesh, v68, v100)!.id)).toBe(false);
  expect(walls.has(edgeBetween(repair.document.mesh, v100, v101)!.id)).toBe(false);
  const wall = repair.document.featureGroups.find(g => g.kind === "wall")!;
  const vertices = featureGroupVertices(repair.document, wall);
  expect(vertices).not.toContain(v100);
  expect(vertices[0]).toBe(vertices.at(-1));
  expect(isSimplePolygon(vertices.slice(0, -1).map(id => repair.document.mesh.vertices[id].point))).toBe(true);
  for (const river of document.featureGroups.filter(g => g.kind === "river")) {
    expect(repair.document.featureGroups.find(g => g.id === river.id)).toEqual(river);
    for (const id of river.vertices) expect(repair.document.mesh.vertices[id]).toEqual(document.mesh.vertices[id]);
  }
  for (const point of [dryChordFixture.locations.v61, dryChordFixture.locations.v66])
    expect(vertexHasCrossing(repair.document, vertexAt(point), "wall", "river")).toBe(true);
  const repeated = repairRiverWalls(repair.document, urbanRegions);
  expect(repeated.issues).toEqual([]);
  expect(repeated.splitFaces).toBe(0);
  expect(kindEdgeIds(repeated.document, "wall")).toEqual(walls);
});

it("does not split a protected cell for a dry river detour", () => {
  const { document, urbanRegions, vertexAt } = input(dryChordFixture);
  const start = vertexAt(dryChordFixture.locations.v68);
  const end = vertexAt(dryChordFixture.locations.v101);
  const face = incidentFaces(document.mesh, start).find(f => faceVertices(document.mesh, f).includes(end))!;
  const repair = repairRiverWalls(document, urbanRegions, new Set([face.id]));
  expect(repair.issues.length).toBeGreaterThan(0);
  expect(edgeBetween(repair.document.mesh, start, end)).toBeNull();
  expect(repair.document.mesh.faces[face.id]).toEqual(document.mesh.faces[face.id]);
  expect(validate(repair.document)).toEqual([]);
});
