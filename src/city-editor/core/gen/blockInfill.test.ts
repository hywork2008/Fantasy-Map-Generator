import { describe, expect, it } from "vitest";
import { meshFromCells } from "../mesh";
import type { CityDocument, Point } from "../types";
import { buildBlockFabric, convexInfillParts } from "./blockInfill";
import { createFabricPlan } from "./fabricDistricts";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid, segmentSegmentHit } from "./geom";

function fixture(polygons: Point[][]): CityDocument {
  const mesh = meshFromCells(
    polygons.map((polygon, id) => ({
      id,
      polygon,
      site: polygonCentroid(polygon),
      centroid: polygonCentroid(polygon),
      neighbors: [],
      onBorder: false
    }))
  );
  for (const face of Object.values(mesh.faces))
    Object.assign(face.properties, { ward: "craftsmen", settlement: "core" });
  const edge = Object.values(mesh.edges).find(
    e => mesh.vertices[e.a].point[0] === 0 && mesh.vertices[e.b].point[0] === 0
  )!;
  return {
    format: "fmg-city-editor",
    version: 1,
    gridKind: "evolution",
    frame: { extentMeters: 1000, cityRadiusMeters: 400, blockSizeMeters: 50 },
    mesh,
    featureGroups: [
      {
        id: "road",
        kind: "road",
        name: "Entry road",
        segments: [{ edgeId: edge.id, forward: true }],
        style: { widthMeters: 8, color: "black" },
        locked: false
      }
    ],
    gates: [],
    elements: []
  };
}
const rect: Point[] = [
  [0, 0],
  [240, 0],
  [240, 180],
  [0, 180]
];

function connectedLaneSegments(fabric: ReturnType<typeof buildBlockFabric>) {
  const segments = fabric.lanes.flatMap(l => l.points.slice(1).map((p, i) => [l.points[i], p] as [Point, Point]));
  const connected = (a: Point[], b: Point[]) =>
    !!segmentSegmentHit(a[0], a[1], b[0], b[1]) ||
    a.some(p => nearestOnPolyline(p, b).dist < 1e-5) ||
    b.some(p => nearestOnPolyline(p, a).dist < 1e-5);
  const seen = new Set<number>([0]);
  const queue = [0];
  for (let i = 0; i < queue.length; i++)
    for (let j = 0; j < segments.length; j++)
      if (!seen.has(j) && connected(segments[queue[i]], segments[j])) {
        seen.add(j);
        queue.push(j);
      }
  return { segments, seen };
}

describe("coarse-cell infill", () => {
  it("splits a core cell into closed street blocks without adding mesh edges", () => {
    const document = fixture([rect]);
    const before = JSON.stringify(document);
    const fabric = buildBlockFabric(document);
    expect(fabric.buildings.length).toBeGreaterThan(70);
    expect(fabric.lanes.length).toBeGreaterThan(2);
    expect(JSON.stringify(document)).toBe(before);
    expect(buildBlockFabric(document)).toEqual(fabric);
    const { segments, seen } = connectedLaneSegments(fabric);
    expect(seen.size).toBe(segments.length);
    expect(
      fabric.buildings.reduce((sum, b) => sum + Math.abs(polygonArea(b.polygon)), 0) / Math.abs(polygonArea(rect))
    ).toBeGreaterThan(0.55);
    for (const building of fabric.buildings) {
      expect(building.polygon.every(p => pointInPolygon(p, rect))).toBe(true);
      // The road is an 8m-wide centre line, so facades begin just beyond its
      // 4m half-width instead of leaving an artificial three-metre forecourt.
      expect(Math.min(...building.polygon.map(p => p[0]))).toBeGreaterThan(4.25);
      for (const lane of fabric.lanes)
        for (const p of building.polygon)
          expect(nearestOnPolyline(p, lane.points).dist).toBeGreaterThanOrEqual(lane.widthMeters / 2 - 1e-5);
    }
  });
  it("packs lots without a street per house and builds along outskirts lanes beyond the major road", () => {
    const document = fixture([rect]);
    document.mesh.faces.f0.properties.settlement = "outskirts";
    const fabric = buildBlockFabric(document);
    expect(fabric.buildings.length).toBeGreaterThan(fabric.lanes.length * 5);
    expect(fabric.buildings.filter(b => polygonCentroid(b.polygon)[0] > 80).length).toBeGreaterThan(20);
    const { segments, seen } = connectedLaneSegments(fabric);
    expect(seen.size).toBe(segments.length);
  });
  it("connects across a shared dry boundary but never opens a wall", () => {
    const document = fixture([
      rect,
      [
        [240, 0],
        [420, 0],
        [420, 180],
        [240, 180]
      ]
    ]);
    expect(buildBlockFabric(document).buildings.some(b => b.faceId === "f1")).toBe(true);
    const shared = Object.values(document.mesh.edges).find(e => e.leftFace && e.rightFace)!;
    document.featureGroups.push({
      id: "wall",
      kind: "wall",
      name: "Wall",
      segments: [{ edgeId: shared.id, forward: true }],
      style: { widthMeters: 6, color: "black" },
      locked: false
    });
    expect(buildBlockFabric(document).buildings.some(b => b.faceId === "f1")).toBe(false);
  });
  it("retains both arms of a concave block and connects across local decomposition seams", () => {
    const polygon: Point[] = [
      [0, 0],
      [240, 0],
      [240, 180],
      [160, 180],
      [160, 60],
      [80, 60],
      [80, 180],
      [0, 180]
    ];
    const parts = convexInfillParts(polygon);
    expect(parts.reduce((sum, p) => sum + Math.abs(polygonArea(p)), 0)).toBeCloseTo(Math.abs(polygonArea(polygon)), 6);
    const document = fixture([polygon]);
    const fabric = buildBlockFabric(document);
    expect(fabric.buildings.some(b => polygonCentroid(b.polygon)[0] > 180)).toBe(true);
    expect(fabric.buildings.some(b => polygonCentroid(b.polygon)[0] < 60)).toBe(true);
    for (const b of fabric.buildings) expect(b.polygon.every(p => pointInPolygon(p, polygon))).toBe(true);
    const { segments, seen } = connectedLaneSegments(fabric);
    expect(seen.size).toBe(segments.length);
    expect(Object.keys(document.mesh.faces)).toHaveLength(1);
  });
  it("grows extra-mural collectors across a dry cell boundary and still stops at a wall", () => {
    const left = rect;
    const right: Point[] = [
      [240, 0],
      [480, 0],
      [480, 180],
      [240, 180]
    ];
    const document = fixture([left, right]);
    for (const face of Object.values(document.mesh.faces)) face.properties.settlement = "outskirts";
    const before = JSON.stringify(document);
    const fabric = buildBlockFabric(document);
    expect(JSON.stringify(document)).toBe(before);
    expect(fabric.buildings.some(b => b.faceId === "f1")).toBe(true);
    expect(
      fabric.lanes.some(l => {
        const xs = l.points.map(p => p[0]);
        return Math.min(...xs) < 230 && Math.max(...xs) > 250;
      })
    ).toBe(true);
    const shared = Object.values(document.mesh.edges).find(e => e.leftFace && e.rightFace)!;
    document.featureGroups.push({
      id: "wall",
      kind: "wall",
      name: "Wall",
      segments: [{ edgeId: shared.id, forward: true }],
      style: { widthMeters: 6, color: "black" },
      locked: false
    });
    const walled = buildBlockFabric(document);
    expect(walled.buildings.some(b => b.faceId === "f1")).toBe(false);
    expect(
      walled.lanes.some(l => {
        const xs = l.points.map(p => p[0]);
        return Math.min(...xs) < 230 && Math.max(...xs) > 250;
      })
    ).toBe(false);
    const planned = fixture([left, right]);
    for (const face of Object.values(planned.mesh.faces)) face.properties.settlement = "outskirts";
    planned.fabric = createFabricPlan(planned, "outskirts-merge");
    expect(planned.fabric.districts.map(d => d.faceIds.length)).toEqual([2]);
    const merged = buildBlockFabric(planned);
    expect(
      merged.lanes.some(l => {
        const xs = l.points.map(p => p[0]);
        return Math.min(...xs) < 230 && Math.max(...xs) > 250;
      })
    ).toBe(true);
  });
  it("leaves inaccessible land and water empty", () => {
    const document = fixture([rect]);
    document.featureGroups = [];
    expect(buildBlockFabric(document).buildings).toEqual([]);
    document.mesh.faces.f0.properties.water = "sea";
    expect(buildBlockFabric(document).lanes).toEqual([]);
  });

  it("generates hybrid fabric for bram layout", () => {
    const document = fixture([rect]);
    document.layout = "bram";
    const fabric = buildBlockFabric(document);
    expect(fabric.buildings.length).toBeGreaterThan(0);
    expect(fabric.lanes.length).toBeGreaterThan(0);
  });

  it("generates classic street growth and frontage fabric for classic layout", () => {
    const document = fixture([rect]);
    document.layout = "classic";
    const fabric = buildBlockFabric(document);
    expect(fabric.buildings.length).toBeGreaterThan(50);
    expect(fabric.lanes.length).toBeGreaterThan(2);
    for (const building of fabric.buildings) {
      expect(building.polygon.every(p => pointInPolygon(p, rect))).toBe(true);
    }
  });
});
