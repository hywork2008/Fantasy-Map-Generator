import { describe, expect, it } from "vitest";
import { createGridDocument, parseDocument } from "../document";
import { facePoints, faceVertices, meshFromCells, validate } from "../mesh";
import type { CityDocument, Id, Point } from "../types";
import { polygonArea, polygonCentroid } from "./geom";
import { rectifyVoronoiBlocks } from "./rectifyVoronoiBlocks";

function junctions(document: CityDocument) {
  const adjacent = new Map<Id, Id[]>();
  for (const e of Object.values(document.mesh.edges)) {
    for (const [a, b] of [
      [e.a, e.b],
      [e.b, e.a]
    ]) {
      if (!adjacent.has(a)) adjacent.set(a, []);
      adjacent.get(a)!.push(b);
    }
  }
  return adjacent;
}

function turning(document: CityDocument) {
  const values: number[] = [];
  for (const [id, ns] of junctions(document)) {
    if (ns.length !== 3) continue;
    const p = document.mesh.vertices[id].point;
    const angles = ns.map(n => {
      const q = document.mesh.vertices[n].point;
      return Math.atan2(q[1] - p[1], q[0] - p[0]);
    });
    values.push(Math.min(...angles.flatMap((a, i) => angles.slice(i + 1).map(b => 1 + Math.cos(a - b)))));
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function expectConvex(document: CityDocument) {
  for (const face of Object.values(document.mesh.faces)) {
    const points = facePoints(document.mesh, face);
    // polygonArea uses the opposite sign to the conventional cross product.
    const sign = -Math.sign(polygonArea(points));
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length];
      const b = points[i];
      const c = points[(i + 1) % points.length];
      expect(sign * ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])), face.id).toBeGreaterThanOrEqual(
        -1e-7
      );
    }
  }
}

describe("Voronoi internal streets", () => {
  for (const seed of ["lanes-a", "lanes-b", "lanes-c"]) {
    it(`${seed}: reduces turning, keeps bends and convex cells, and preserves face identity`, () => {
      const source = createGridDocument({ size: "small", grid: "voronoi", seed });
      const result = rectifyVoronoiBlocks(source, seed);
      expect(turning(result)).toBeLessThan(turning(source) * 0.7);
      expect(turning(result)).toBeGreaterThan(0.001);
      expectConvex(result);
      expect(validate(result)).toEqual([]);
      expect(Object.keys(result.mesh.faces)).toEqual(Object.keys(source.mesh.faces));
      for (const face of Object.values(result.mesh.faces)) {
        expect(
          polygonArea(facePoints(result.mesh, face)) / polygonArea(facePoints(source.mesh, source.mesh.faces[face.id]))
        ).toBeGreaterThanOrEqual(0.4);
      }
      for (const ns of junctions(result).values()) expect(ns.length).toBeLessThanOrEqual(4);
    });
  }

  it("is deterministic, immutable, seed-sensitive and round-trips", () => {
    const source = createGridDocument({ size: "small", grid: "voronoi", seed: "repeat" });
    const saved = JSON.stringify(source);
    const result = rectifyVoronoiBlocks(source, "repeat");
    expect(rectifyVoronoiBlocks(source, "repeat")).toEqual(result);
    expect(rectifyVoronoiBlocks(source, "different")).not.toEqual(result);
    expect(JSON.stringify(source)).toBe(saved);
    expect(parseDocument(JSON.stringify(result))).toEqual(result);
  });

  it("protects roads, rivers, gates, locked edges/faces/elements and nonurban cells", () => {
    const source = createGridDocument({ size: "small", grid: "voronoi", seed: "protect" });
    const faces = Object.values(source.mesh.faces);
    const protectedIds = new Set<Id>();
    const protectFace = (index: number) => {
      for (const id of faceVertices(source.mesh, faces[index])) protectedIds.add(id);
    };
    faces[10].properties.locked = true;
    faces[30].properties.water = "lake";
    faces[50].properties.buildable = false;
    for (const index of [10, 30, 50, 70]) protectFace(index);
    source.elements.push({ id: "landmark", kind: "temple", faceIds: [faces[70].id], locked: true });
    for (const [index, kind] of [
      [90, "road"],
      [110, "wall"]
    ] as const) {
      const edge = source.mesh.edges[faces[index].boundary[0].edgeId];
      source.featureGroups.push({
        id: kind,
        kind,
        name: kind,
        segments: [faces[index].boundary[0]],
        style: { widthMeters: 5, color: "black" },
        locked: false
      });
      protectedIds.add(edge.a).add(edge.b);
      if (kind === "wall") source.gates.push({ id: "gate", vertexId: edge.a, locked: false });
    }
    const river = source.mesh.edges[faces[130].boundary[0].edgeId];
    source.featureGroups.push({
      id: "river",
      kind: "river",
      name: "river",
      vertices: [river.a, river.b],
      source: null,
      mouth: null,
      style: { widthMeters: 5, color: "blue" },
      locked: false
    });
    protectedIds.add(river.a).add(river.b);
    const edge = source.mesh.edges[faces[150].boundary[0].edgeId];
    edge.locked = true;
    protectedIds.add(edge.a).add(edge.b);
    const vertex = faceVertices(source.mesh, faces[170])[0];
    source.mesh.vertices[vertex].locked = true;
    protectedIds.add(vertex);
    const result = rectifyVoronoiBlocks(source, "protect");
    for (const id of protectedIds) expect(result.mesh.vertices[id]).toEqual(source.mesh.vertices[id]);
    expect(result.featureGroups).toEqual(source.featureGroups);
    expect(result.gates).toEqual(source.gates);
    expect(result.elements).toEqual(source.elements);
    expect(validate(result)).toEqual([]);
  });

  it("selectively collapses short junctions without creating high-degree crossings", () => {
    const source = createGridDocument({ size: "small", grid: "voronoi", seed: "collapse" });
    const result = rectifyVoronoiBlocks(source, "collapse");
    expect(Object.keys(result.mesh.vertices).length).toBeLessThan(Object.keys(source.mesh.vertices).length);
    expect([...junctions(result).values()].some(ns => ns.length === 4)).toBe(true);
    expectConvex(result);
  });

  it("leaves an already concave cell untouched", () => {
    const polygons: Point[][] = [
      [
        [0, 0],
        [100, 0],
        [50, 40],
        [100, 100],
        [0, 100]
      ]
    ];
    const source = createGridDocument({ size: "small", grid: "voronoi", seed: "concave" });
    source.mesh = meshFromCells(
      polygons.map((polygon, id) => ({
        id,
        polygon,
        site: polygonCentroid(polygon),
        centroid: polygonCentroid(polygon),
        onBorder: true,
        neighbors: []
      }))
    );
    expect(rectifyVoronoiBlocks(source, "concave")).toEqual(source);
  });
});
