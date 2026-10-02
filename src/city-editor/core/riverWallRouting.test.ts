import { expect, it } from "vitest";
import { featureGroupVertices } from "./features";
import fixture from "./fixtures/river-wall-diagonal-20261002.json";
import { isSimplePolygon, polygonCentroid } from "./gen/geom";
import { edgeBetween, facePoints, meshFromCells, validate } from "./mesh";
import { kindEdgeIds, vertexHasCrossing } from "./passages";
import { repairRiverWalls } from "./riverWallRouting";
import type { CityDocument, Point } from "./types";

// Geometry from ce-generation-failure-20261002-154641.svg (seed 1ut3dv1).
function input() {
  const mesh = meshFromCells(
    fixture.faces.map((face, id) => {
      const polygon = face.polygon as Point[];
      const center = polygonCentroid(polygon);
      return { id, polygon, centroid: center, site: center, neighbors: [], onBorder: false };
    })
  );
  fixture.faces.forEach((face, id) => {
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
    featureGroups: fixture.features.map(feature => {
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
