import { expect, it } from "vitest";
import fixture from "./fixtures/river-wall-deformation-20261002.json";
import { finishCityGeometry } from "./gen/finishCityGeometry";
import { isSimplePolygon, nearestOnPolyline, polygonArea, polygonCentroid, segmentSegmentHit } from "./gen/geom";
import { facePoints, faceVertices, meshFromCells, moveVertex, validate } from "./mesh";
import { moveVertexWithNeighbors } from "./meshDeformation";
import { repairRiverWalls } from "./riverWallRouting";
import type { CityDocument, Point } from "./types";

function input() {
  const mesh = meshFromCells(
    fixture.faces.map((points, id) => {
      const polygon = points as Point[];
      const center = polygonCentroid(polygon);
      return { id, polygon, centroid: center, site: center, neighbors: [], onBorder: false };
    })
  );
  const vertexAt = (point: number[]) =>
    Object.values(mesh.vertices).find(v => Math.hypot(v.point[0] - point[0], v.point[1] - point[1]) < 1e-7)!.id;
  const river = fixture.river.map(vertexAt);
  const vertexId = vertexAt(fixture.foldingTarget);
  const target = fixture.foldingTarget as Point;
  // The SVG is the already rejected geometry. Restore a simple starting
  // corner, then reproduce the displacement that folds f57.
  mesh.vertices[vertexId].point = [target[0] + 5, target[1]];
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    gridKind: "evolution",
    frame: { extentMeters: 600, cityRadiusMeters: 198, blockSizeMeters: 50 },
    mesh,
    gates: [],
    elements: [],
    featureGroups: [
      {
        id: "gc:river-0",
        kind: "river",
        name: "River",
        vertices: river,
        locked: false,
        style: { widthMeters: fixture.riverWidthMeters }
      }
    ]
  };
  const reference = new Map(Object.values(mesh.vertices).map(v => [v.id, v.point]));
  return { document, vertexId, target, reference, river };
}

const tangled = (document: CityDocument) =>
  Object.values(document.mesh.faces)
    .filter(face => !isSimplePolygon(facePoints(document.mesh, face)))
    .map(face => face.id);

it("moves several shared corners to keep brxqw6 f57 and its neighboring cells simple", () => {
  const { document, vertexId, target, reference, river } = input();
  const before = structuredClone(document);
  expect(tangled(document)).toEqual([]);
  expect(tangled(moveVertex(document, vertexId, target)!)).toEqual(["f57"]);
  const fixed = new Set([river[0], river.at(-1)!]);
  const moved = moveVertexWithNeighbors(document, vertexId, target, fixed, reference, 20)!;
  expect(moved).not.toBeNull();
  expect(moved.mesh.vertices[vertexId].point).toEqual(target);
  expect(tangled(moved)).toEqual([]);
  expect(validate(moved)).toEqual([]);
  expect(document).toEqual(before);
  const changed = Object.values(moved.mesh.vertices).filter(v => v.point.some((p, i) => p !== reference.get(v.id)![i]));
  expect(changed.length).toBeGreaterThan(1);
  const local = new Set(faceVertices(document.mesh, document.mesh.faces.f57));
  for (const vertex of changed) {
    expect(local.has(vertex.id)).toBe(true);
    const start = reference.get(vertex.id)!;
    expect(Math.hypot(vertex.point[0] - start[0], vertex.point[1] - start[1])).toBeLessThanOrEqual(20);
  }
  for (const id of fixed) expect(moved.mesh.vertices[id]).toEqual(document.mesh.vertices[id]);
  for (const face of Object.values(moved.mesh.faces))
    expect(
      polygonArea(facePoints(moved.mesh, face)) / polygonArea(facePoints(document.mesh, document.mesh.faces[face.id]))
    ).toBeGreaterThanOrEqual(0.2);
});

it("rejects a folding move when its neighboring corners are fixed or locked", () => {
  const { document, vertexId, target, reference } = input();
  const neighbors = faceVertices(document.mesh, document.mesh.faces.f57).filter(id => id !== vertexId);
  const before = structuredClone(document);
  expect(moveVertexWithNeighbors(document, vertexId, target, new Set(neighbors), reference, 20)).toBeNull();
  expect(document).toEqual(before);
  for (const id of neighbors) document.mesh.vertices[id].locked = true;
  const locked = structuredClone(document);
  expect(moveVertexWithNeighbors(document, vertexId, target, new Set(), reference, 20)).toBeNull();
  expect(document).toEqual(locked);
});

it("rejects displacement beyond the local movement budget", () => {
  const { document, vertexId, target, reference } = input();
  const before = structuredClone(document);
  expect(moveVertexWithNeighbors(document, vertexId, target, new Set(), reference, 4)).toBeNull();
  expect(document).toEqual(before);
});

it("separates a river from a fixed wall while deforming f57 without self-intersections", () => {
  const { document, vertexId, river } = input();
  const origin = document.mesh.vertices[vertexId].point;
  // A short fixed curtain forces separation on the river side of the cell.
  document.mesh.vertices.wa = { id: "wa", point: [origin[0] + 4, origin[1] - 4], locked: true };
  document.mesh.vertices.wb = { id: "wb", point: [origin[0] + 4, origin[1] + 2], locked: true };
  document.mesh.edges.e900 = { id: "e900", a: "wa", b: "wb", leftFace: null, rightFace: null, locked: false };
  document.featureGroups.push({
    id: "gc:wall-0",
    name: "Wall",
    kind: "wall",
    locked: false,
    style: { widthMeters: 7 },
    segments: [{ edgeId: "e900", forward: true }]
  });
  const before = structuredClone(document);
  const urban = Object.values(document.mesh.faces).map(face => facePoints(document.mesh, face));
  const repair = repairRiverWalls(document, urban);
  expect(repair.issues).toEqual([]);
  expect(repair.adjustments.some(message => message.startsWith("河川の離隔調整"))).toBe(true);
  expect(tangled(repair.document)).toEqual([]);
  expect(validate(repair.document)).toEqual([]);
  expect(document).toEqual(before);
  const corners = faceVertices(document.mesh, document.mesh.faces.f57);
  expect(
    corners.filter(id =>
      repair.document.mesh.vertices[id].point.some((p, i) => p !== document.mesh.vertices[id].point[i])
    ).length
  ).toBeGreaterThan(1);
  for (const id of ["wa", "wb", river[0], river.at(-1)!])
    expect(repair.document.mesh.vertices[id]).toEqual(document.mesh.vertices[id]);
  const a = repair.document.mesh.vertices.wa.point;
  const b = repair.document.mesh.vertices.wb.point;
  const line = river.map(id => repair.document.mesh.vertices[id].point);
  const minimum = 7 / 2 + fixture.riverWidthMeters / 2 + 2;
  for (let i = 1; i < line.length; i++) {
    const c = line[i - 1],
      d = line[i];
    expect(segmentSegmentHit(a, b, c, d)).toBeNull();
    const distance = Math.min(
      nearestOnPolyline(a, [c, d]).dist,
      nearestOnPolyline(b, [c, d]).dist,
      nearestOnPolyline(c, [a, b]).dist,
      nearestOnPolyline(d, [a, b]).dist
    );
    expect(distance).toBeGreaterThanOrEqual(minimum - 1e-7);
  }
  expect(tangled(finishCityGeometry(repair.document))).toEqual([]);
});
