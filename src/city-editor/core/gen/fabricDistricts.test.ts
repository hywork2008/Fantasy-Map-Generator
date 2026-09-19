import { describe, expect, it } from "vitest";
import { parseDocument } from "../document";
import { defaultGenerationSettings, generateStageOnDocument } from "../generate";
import { DocumentHistory } from "../history";
import {
  facePoints,
  faceVertices,
  mergeFaces,
  meshFromCells,
  moveVertex,
  setFaceWater,
  splitFace,
  validate
} from "../mesh";
import type { CityDocument, Point } from "../types";
import { buildBlockFabric, FabricCache } from "./blockInfill";
import { createFabricPlan, districtDocument, resolveDistricts, setDistrictParameters } from "./fabricDistricts";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "./geom";

function fixture(): CityDocument {
  const origins = [
    [0, 0],
    [120, 0],
    [0, 120],
    [120, 120],
    [600, 0]
  ];
  const mesh = meshFromCells(
    origins.map(([x, y], id) => {
      const polygon: Point[] = [
        [x, y],
        [x + 120, y],
        [x + 120, y + 120],
        [x, y + 120]
      ];
      return {
        id,
        polygon,
        site: polygonCentroid(polygon),
        centroid: polygonCentroid(polygon),
        neighbors: [],
        onBorder: false
      };
    })
  );
  for (const face of Object.values(mesh.faces))
    Object.assign(face.properties, { ward: "craftsmen", settlement: "core", buildable: true });
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    gridKind: "evolution",
    frame: { extentMeters: 1000, cityRadiusMeters: 400, blockSizeMeters: 50 },
    mesh,
    featureGroups: [],
    gates: [],
    elements: []
  };
  for (const x of [0, 600]) {
    const edge = Object.values(mesh.edges).find(
      e => mesh.vertices[e.a].point[0] === x && mesh.vertices[e.b].point[0] === x
    )!;
    document.featureGroups.push({
      id: `road-${x}`,
      kind: "road",
      name: "Street",
      locked: false,
      segments: [{ edgeId: edge.id, forward: true }],
      style: { widthMeters: 8, color: "black" }
    });
  }
  document.fabric = createFabricPlan(document, "district-test");
  return document;
}
const shapes = (document: CityDocument, cache = new FabricCache()) =>
  buildBlockFabric(document, cache).buildings.map(b => b.polygon);

describe("multi-cell district fabric", () => {
  it("draws across internal cell edges and ignores a moved internal junction", () => {
    const document = fixture(),
      cache = new FabricCache();
    const before = JSON.stringify(document);
    const buildings = buildBlockFabric(document, cache).buildings;
    expect(document.fabric!.districts.map(d => d.faceIds.length)).toEqual([4, 1]);
    expect(buildings.length).toBeGreaterThan(60);
    expect(
      buildings.some(
        b => !b.polygon.every(p => pointInPolygon(p, facePoints(document.mesh, document.mesh.faces[b.faceId])))
      )
    ).toBe(true);
    const moved = structuredClone(document);
    const vertex = Object.values(moved.mesh.vertices).find(v => v.point[0] === 120 && v.point[1] === 120)!;
    vertex.point = [135, 110];
    const misses = cache.misses;
    expect(shapes(moved, cache)).toEqual(buildings.map(b => b.polygon));
    expect(cache.misses).toBe(misses);
    expect(JSON.stringify(document)).toBe(before);
    expect(validate(document)).toEqual([]);
  });

  it("invalidates only the affected district after an outer boundary or street-width edit", () => {
    const document = fixture(),
      cache = new FabricCache();
    const before = buildBlockFabric(document, cache);
    const moved = structuredClone(document);
    const vertex = Object.values(moved.mesh.vertices).find(v => v.point[0] === 720 && v.point[1] === 120)!;
    vertex.point[0] += 20;
    const misses = cache.misses;
    const after = buildBlockFabric(moved, cache);
    expect(cache.misses - misses).toBe(1);
    expect(after.buildings.filter(b => b.faceId !== "f4")).toEqual(before.buildings.filter(b => b.faceId !== "f4"));
    expect(after.buildings.filter(b => b.faceId === "f4")).not.toEqual(before.buildings.filter(b => b.faceId === "f4"));
    const widened = structuredClone(document);
    widened.featureGroups[1].style.widthMeters = 24;
    const previousMisses = cache.misses;
    buildBlockFabric(widened, cache);
    expect(cache.misses - previousMisses).toBe(1);
  });

  it("splits districts at new barriers and locks without mutating the saved mesh", () => {
    const document = fixture();
    const internal = Object.values(document.mesh.edges).filter(
      e =>
        e.leftFace &&
        e.rightFace &&
        document.mesh.vertices[e.a].point[0] === 120 &&
        document.mesh.vertices[e.b].point[0] === 120
    );
    document.featureGroups.push({
      id: "wall",
      kind: "wall",
      name: "Wall",
      locked: true,
      segments: internal.map(e => ({ edgeId: e.id, forward: true })),
      style: { widthMeters: 6, color: "black" }
    });
    expect(resolveDistricts(document, document.fabric).map(d => d.faceIds.length)).toEqual([2, 2, 1]);
    document.mesh.faces.f0.properties.locked = true;
    expect(resolveDistricts(document, document.fabric).find(d => d.faceIds.includes("f0"))!.faceIds).toEqual(["f0"]);
    expect(setDistrictParameters(document, "f0", { lotArea: 300 })).toBeNull();
    const vertex = faceVertices(document.mesh, document.mesh.faces.f0)[0];
    expect(moveVertex(document, vertex, [10, 10])).toBeNull();
    expect(setFaceWater(document, "f0", "sea")).toBe(document);
    expect(validate(districtDocument(document, resolveDistricts(document, document.fabric)))).toEqual([]);
  });

  it("persists density edits through JSON and Undo/Redo while retaining remote geometry", () => {
    const document = fixture();
    const edited = setDistrictParameters(document, "f0", { lotArea: 400, occupancy: 0.5, laneWidth: 4 })!;
    expect(shapes(edited).length).toBeLessThan(shapes(document).length);
    const remote = (d: CityDocument) => buildBlockFabric(d).buildings.filter(b => b.faceId === "f4");
    expect(remote(edited)).toEqual(remote(document));
    const history = new DocumentHistory(document);
    history.commit(edited);
    expect(history.undo(edited)).toEqual(document);
    expect(history.redo(document)).toEqual(edited);
    expect(shapes(parseDocument(JSON.stringify(edited))!)).toEqual(shapes(edited));
    const malformed = structuredClone(edited);
    malformed.fabric!.districts[0].parameters.laneWidth = -1;
    expect(parseDocument(JSON.stringify(malformed))).toBeNull();
  });

  it("keeps auxiliary face splits in the same district and preserves building geometry", () => {
    const document = fixture();
    const vertices = faceVertices(document.mesh, document.mesh.faces.f0);
    const split = splitFace(document, "f0", vertices[0], vertices[2])!;
    expect(split).not.toBeNull();
    expect(shapes(split)).toEqual(shapes(document));
    expect(split.fabric!.districts[0].faceIds).toHaveLength(5);
    const added = Object.keys(split.mesh.faces).find(id => !document.mesh.faces[id])!;
    const merged = mergeFaces(split, "f0", added)!;
    expect(shapes(merged)).toEqual(shapes(document));
    expect(parseDocument(JSON.stringify(merged))).not.toBeNull();
  });

  it("orients local streets while keeping buildings aligned with their frontage and invalidates river dependencies", () => {
    const document = fixture();
    const edited = setDistrictParameters(document, "f0", { orientation: 0.3 })!;
    const fabric = buildBlockFabric(edited);
    const lanes = fabric.lanes.filter(l => l.faceId !== "f4");
    expect(
      lanes.some(l => {
        const a = l.points[0],
          b = l.points.at(-1)!;
        return Math.abs(Math.sin(2 * (Math.atan2(b[1] - a[1], b[0] - a[0]) - 0.3))) < 1e-6;
      })
    ).toBe(true);
    for (const building of fabric.buildings.filter(b => b.faceId !== "f4")) {
      const hasFront = building.polygon.some((a, i) => {
        const b = building.polygon[(i + 1) % building.polygon.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 3) return false;
        if (Math.abs(a[0] - 7.15) < 1e-5 && Math.abs(b[0] - 7.15) < 1e-5) return true;
        return lanes.some(l => {
          const c = l.points[0],
            d = l.points.at(-1)!;
          const length = Math.hypot(d[0] - c[0], d[1] - c[1]);
          const offset = (p: Point) => Math.abs((p[0] - c[0]) * (d[1] - c[1]) - (p[1] - c[1]) * (d[0] - c[0])) / length;
          // An oblique junction may put the last frontage corner beyond the
          // segment endpoint; both ends still lie on the same offset line.
          const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          return (
            Math.abs(offset(a) - offset(b)) < 0.08 &&
            Math.abs(offset(a) - l.widthMeters / 2 - 0.5) < 0.45 &&
            nearestOnPolyline(middle, l.points).dist < l.widthMeters / 2 + 0.8
          );
        });
      });
      expect(hasFront).toBe(true);
    }
    const edge = Object.values(document.mesh.edges).find(
      e => document.mesh.vertices[e.a].point[0] === 720 && document.mesh.vertices[e.b].point[0] === 720
    )!;
    document.featureGroups.push({
      id: "river",
      kind: "river",
      name: "River",
      vertices: [edge.a, edge.b],
      source: null,
      mouth: null,
      style: { widthMeters: 8, color: "blue" },
      locked: false
    });
    const cache = new FabricCache();
    const before = buildBlockFabric(document, cache);
    const widened = structuredClone(document);
    widened.featureGroups[2].style.widthMeters = 30;
    const misses = cache.misses;
    const after = buildBlockFabric(widened, cache);
    expect(cache.misses - misses).toBe(1);
    expect(after.buildings.filter(b => b.faceId !== "f4")).toEqual(before.buildings.filter(b => b.faceId !== "f4"));
  });

  it("retains locked generated features and face properties when rerunning generation stages", () => {
    const document = fixture();
    document.featureGroups[0].id = "gc:road-0";
    document.featureGroups[0].locked = true;
    document.mesh.faces.f0.properties.locked = true;
    document.elements.push({ id: "gc:temple", kind: "temple", faceIds: ["f0"], locked: true });
    const settings = defaultGenerationSettings();
    settings.config.coast = "none";
    settings.config.rivers = [];
    const next = generateStageOnDocument(document, settings, "locked", 1)!;
    expect(next).not.toBeNull();
    expect(next.featureGroups.find(g => g.id === "gc:road-0")).toEqual(document.featureGroups[0]);
    expect(next.elements).toContainEqual(document.elements[0]);
    expect(next.mesh.faces.f0).toEqual(document.mesh.faces.f0);
  });

  it("draws farm rows without buildings or extra mesh edges", () => {
    const document = fixture();
    document.mesh.faces.f4.properties.ward = "farm";
    const mesh = JSON.stringify(document.mesh);
    const fabric = buildBlockFabric(document);
    expect(fabric.farms.length).toBeGreaterThan(0);
    expect(fabric.farms[0].rows.length).toBeGreaterThan(5);
    expect(fabric.buildings.some(b => b.faceId === "f4")).toBe(false);
    expect(JSON.stringify(document.mesh)).toBe(mesh);
  });
});
