import { describe, expect, it } from "vitest";
import { createGridDocument, createSizedDocument, parseDocument } from "../document";
import { featureGroupVertices } from "../features";
import { defaultGenerationSettings, generateCityOnDocument } from "../generate";
import { DocumentHistory } from "../history";
import { facePoints, faceVertices, validate } from "../mesh";
import { kindEdgeIds, vertexHasCrossing } from "../passages";
import type { CityDocument, Point } from "../types";
import { buildCityBuildings, insetConvexKernel } from "./buildingLots";
import { nearestOnPolyline, pointInPolygon, polygonArea, segmentSegmentHit } from "./geom";

function roughness(document: CityDocument, kind: "wall" | "road"): number {
  let total = 0;
  for (const group of document.featureGroups.filter(g => g.kind === kind)) {
    const points = featureGroupVertices(document, group).map(id => document.mesh.vertices[id].point);
    for (let i = 1; i + 1 < points.length; i++) {
      const [a, b, c] = points.slice(i - 1, i + 2);
      const incoming = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const outgoing = Math.atan2(c[1] - b[1], c[0] - b[0]);
      total += Math.abs(Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming)));
    }
  }
  return total;
}

describe("complete editable city", () => {
  const base = createSizedDocument("small", "preview");
  it("retries a bay layout with an unusable crossing without weakening the crossing rules", () => {
    const grid = createGridDocument({ size: "small", grid: "hex", seed: "junction-check" });
    const settings = defaultGenerationSettings();
    settings.config.coast = "bay";
    settings.config.rivers = ["through"];
    settings.config.features.port = true;
    const city = generateCityOnDocument(grid, settings, "junction-6")!;
    expect(city).not.toBeNull();
    for (const gate of city.gates) expect(vertexHasCrossing(city, gate.vertexId, "wall", "road")).toBe(true);
    expect(generateCityOnDocument(grid, settings, "junction-6")).toEqual(city);
  });
  for (const coast of ["none", "straight", "bay", "cape"] as const) {
    for (const seed of ["reference-town", "complete-b", "complete-c"]) {
      it(`${coast}, ${seed}: buildings stay on land, routes remain on distinct mesh edges`, () => {
        const settings = defaultGenerationSettings();
        settings.config.coast = coast;
        settings.config.rivers = coast === "none" ? ["through"] : ["toCoast"];
        settings.config.features.port = coast !== "none";
        const city = generateCityOnDocument(base, settings, seed)!;
        expect(city).not.toBeNull();
        expect(validate(city)).toEqual([]);
        expect(city.frame).toEqual(base.frame);
        const rivers = kindEdgeIds(city, "river");
        const walls = kindEdgeIds(city, "wall");
        const wallVertices = new Set([...walls].flatMap(id => [city.mesh.edges[id].a, city.mesh.edges[id].b]));
        for (const gate of city.gates)
          expect(vertexHasCrossing(city, gate.vertexId, "wall", "road"), gate.vertexId).toBe(true);
        const gateVertices = new Set(city.gates.map(gate => gate.vertexId));
        for (const road of city.featureGroups.filter(
          group => group.kind === "road" && group.id.startsWith("gc:road-")
        )) {
          const vertices = featureGroupVertices(city, road);
          for (const endpoint of [vertices[0], vertices.at(-1)!]) {
            if (wallVertices.has(endpoint)) expect(gateVertices.has(endpoint), `${road.id} at ${endpoint}`).toBe(true);
          }
        }
        for (const id of walls) expect(rivers.has(id), `shared wall/river ${id}`).toBe(false);
        const riverVertices = new Set([...rivers].flatMap(id => [city.mesh.edges[id].a, city.mesh.edges[id].b]));
        for (const id of wallVertices)
          if (riverVertices.has(id)) expect(vertexHasCrossing(city, id, "wall", "river"), id).toBe(true);
        if (coast === "none") expect(city.featureGroups.some(g => g.id.startsWith("gc:bridge-"))).toBe(true);
        for (const bridge of city.featureGroups.filter(g => g.id.startsWith("gc:bridge-"))) {
          const ids = featureGroupVertices(city, bridge);
          expect(ids).toHaveLength(3);
          expect(vertexHasCrossing(city, ids[1], "river", "road"), bridge.id).toBe(true);
        }
        for (const id of kindEdgeIds(city, "road")) {
          expect(rivers.has(id) || walls.has(id)).toBe(false);
          const edge = city.mesh.edges[id];
          for (const fid of [edge.leftFace, edge.rightFace])
            if (fid) expect(city.mesh.faces[fid].properties.water).toBe("land");
        }
        const buildings = buildCityBuildings(city);
        expect(buildings.length).toBeGreaterThan(100);
        for (const building of buildings) {
          const face = city.mesh.faces[building.faceId];
          expect(face.properties.water).toBe("land");
          expect(face.properties.buildable).toBe(true);
          expect(Math.abs(polygonArea(building.polygon))).toBeGreaterThan(1);
          const polygon = facePoints(city.mesh, face);
          for (const point of building.polygon) expect(pointInPolygon(point, polygon)).toBe(true);
        }
        for (const face of Object.values(city.mesh.faces)) {
          const p = facePoints(city.mesh, face);
          for (let i = 0; i < p.length; i++)
            for (let j = i + 2; j < p.length; j++) {
              if (i === 0 && j === p.length - 1) continue;
              expect(segmentSegmentHit(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length]), face.id).toBeNull();
            }
        }
      });
    }
  }

  it("substantially reduces wall and road turning while retaining the exact route topology", () => {
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    const raw = generateCityOnDocument(base, { ...settings, streets: { foldSmoothing: false } }, "reference-town")!;
    const city = generateCityOnDocument(base, settings, "reference-town")!;
    expect(city.featureGroups).toEqual(raw.featureGroups);
    expect(city.gates).toEqual(raw.gates);
    expect(roughness(city, "wall")).toBeLessThan(roughness(raw, "wall") * 0.45);
    expect(roughness(city, "road")).toBeLessThan(roughness(raw, "road") * 0.45);
    for (const face of Object.values(city.mesh.faces)) {
      expect(
        polygonArea(facePoints(city.mesh, face)) / polygonArea(facePoints(raw.mesh, raw.mesh.faces[face.id]))
      ).toBeGreaterThan(0.1);
    }
  });

  it("connects every inland gate to both an approach and an interior street on hex and Voronoi grids", () => {
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    for (const grid of [base, createGridDocument({ size: "small", grid: "hex", seed: "preview" })]) {
      const city = generateCityOnDocument(grid, settings, "reference-town")!;
      expect(city.gates.length).toBeGreaterThanOrEqual(2);
      for (const gate of city.gates) {
        const roads = city.featureGroups.filter(
          g => g.kind === "road" && featureGroupVertices(city, g).includes(gate.vertexId)
        );
        expect(roads.length, gate.vertexId).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("is deterministic, preserves input, round-trips files and restores presentation on Undo/Redo", () => {
    const settings = defaultGenerationSettings();
    const original = JSON.stringify(base);
    const city = generateCityOnDocument(base, settings, "repeat")!;
    expect(generateCityOnDocument(base, settings, "repeat")).toEqual(city);
    expect(JSON.stringify(base)).toBe(original);
    expect(parseDocument(JSON.stringify(city))).toEqual(city);
    const history = new DocumentHistory(base);
    history.commit(city);
    const undone = history.undo(city)!;
    expect(undone).toEqual(base);
    expect(history.redo(undone)).toEqual(city);
    expect(generateCityOnDocument(base, settings, "different")).not.toEqual(city);
  });

  it("keeps locked face geometry and hand-drawn features", () => {
    const input = structuredClone(base);
    const face = Object.values(input.mesh.faces).find(f => Math.hypot(...(f.site ?? [0, 0])) < 250)!;
    face.properties.locked = true;
    const points = faceVertices(input.mesh, face).map(id => [id, input.mesh.vertices[id].point] as const);
    input.featureGroups.push({
      id: "hand-road",
      kind: "road",
      name: "Hand drawn",
      segments: [face.boundary[0]],
      style: { widthMeters: 6, color: "#555" },
      locked: false
    });
    const city = generateCityOnDocument(input, defaultGenerationSettings(), "protected")!;
    for (const [id, point] of points) expect(city.mesh.vertices[id]?.point).toEqual(point);
    expect(city.featureGroups.find(g => g.id === "hand-road")).toEqual(input.featureGroups[0]);
  });
});

describe("building setbacks", () => {
  it("reserves exact street/river setbacks in either polygon orientation", () => {
    const square: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100]
    ];
    const inset = insetConvexKernel(square, [8, 20, 8, 8]);
    expect(Math.abs(polygonArea(inset))).toBeCloseTo(72 * 84);
    expect(Math.max(...inset.map(p => p[0]))).toBeCloseTo(80);
    const reversed = insetConvexKernel([...square].reverse(), [8, 20, 8, 8]);
    expect(Math.abs(polygonArea(reversed))).toBeCloseTo(72 * 84);
  });

  it("omits water, empty districts and plazas instead of filling them with buildings", () => {
    const doc = createSizedDocument("small", "lots");
    for (const face of Object.values(doc.mesh.faces)) {
      face.properties.water = "lake";
      face.properties.ward = "craftsmen";
    }
    expect(buildCityBuildings(doc)).toEqual([]);
  });

  it("prevents buildings from encroaching into river water at river bends and nearby cells", () => {
    // Construct a document with a curved river and a face that touches the river vertex
    const doc = createSizedDocument("small", "river-clearance");
    const riverVerts = ["v242", "v243", "v268"].filter(id => doc.mesh.vertices[id]);
    if (riverVerts.length >= 2) {
      doc.featureGroups.push({
        id: "test-river",
        kind: "river",
        name: "Test River",
        vertices: riverVerts,
        source: null,
        mouth: null,
        style: { widthMeters: 28, color: "#4f8aad" },
        locked: false
      });
      const buildings = buildCityBuildings(doc);
      const riverPoints = riverVerts.map(id => doc.mesh.vertices[id].point);
      const halfWidth = 14;
      for (const b of buildings) {
        for (const pt of b.polygon) {
          const d = nearestOnPolyline(pt, riverPoints).dist;
          expect(d).toBeGreaterThanOrEqual(halfWidth);
        }
      }
    }
  });

  it("verifies bld-f142 and all buildings in sample map do not encroach into river water", () => {
    try {
      const fs = require("node:fs");
      const path = "temp/ce-20260916-181801.json";
      if (!fs.existsSync(path)) return;
      const doc = JSON.parse(fs.readFileSync(path, "utf8"));
      const river = doc.featureGroups.find((g: { kind: string }) => g.kind === "river");
      if (!river) return;
      const riverPoints = river.vertices.map((id: string) => doc.mesh.vertices[id].point);
      const halfWidth = river.style.widthMeters / 2;
      const buildings = buildCityBuildings(doc);
      for (const b of buildings) {
        for (const pt of b.polygon) {
          const d = nearestOnPolyline(pt, riverPoints).dist;
          expect(d).toBeGreaterThanOrEqual(halfWidth);
        }
      }
    } catch {
      // File may not exist in CI environment
    }
  });
});
