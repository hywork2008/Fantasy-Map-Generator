import { describe, expect, it } from "vitest";
import { createTownWater } from "../../city3d/three/waterMeshes";
import { parseDocument } from "../services/io/documentCodec";
import type { CityDocument } from "../types/document";
import { deleteCastle } from "./castles";
import { createFortressStudy } from "./fortressStudy";
import { polygonCentroid } from "./geom";
import { facePoints } from "./mesh";
import { castleSiteFaceIds, setCastlePlatform } from "./terrainEditing";
import { cityTerrain } from "./terrainElevation";

const study = () => {
  const doc = createFortressStudy();
  const castle = doc.castles![0];
  const faceIds = castleSiteFaceIds(doc, castle);
  const top = Math.max(...faceIds.map(id => doc.mesh.faces[id].properties.elevation)) + 12;
  return { doc, castle, faceIds, top };
};

/** Midpoints of edges between platform cells and other cells, with the normal into the platform. */
function rim(doc: CityDocument, faceIds: string[]) {
  const set = new Set(faceIds);
  return faceIds.flatMap(id =>
    doc.mesh.faces[id].boundary.flatMap(ref => {
      const edge = doc.mesh.edges[ref.edgeId];
      const other = edge.leftFace === id ? edge.rightFace : edge.leftFace;
      if (!other || set.has(other) || doc.mesh.faces[other].properties.water !== "land") return [];
      const a = doc.mesh.vertices[edge.a].point,
        b = doc.mesh.vertices[edge.b].point;
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const center = polygonCentroid(facePoints(doc.mesh, doc.mesh.faces[id]));
      const length = Math.hypot(center[0] - mid[0], center[1] - mid[1]);
      return [{ mid, inward: [(center[0] - mid[0]) / length, (center[1] - mid[1]) / length] as const }];
    })
  );
}

describe("castle platform", () => {
  it("levels the castle cells flat and drops them by a cliff at the cell edges", () => {
    const { doc, castle, faceIds, top } = study();
    const next = setCastlePlatform(doc, castle.id, { levelMeters: top, edge: { kind: "cliff" } })!;
    const terrain = cityTerrain(next),
      level = top - terrain.datumMeters;
    const set = new Set(faceIds);
    const surface = terrain.triangles.filter(patch => set.has(patch.faceId) && !patch.escarpment);
    expect(surface.length).toBeGreaterThan(0);
    for (const patch of surface) for (const height of patch.heights) expect(height).toBeCloseTo(level, 6);
    expect(terrain.triangles.some(patch => patch.escarpment)).toBe(true);
    const edges = rim(next, faceIds);
    expect(edges.length).toBeGreaterThan(0);
    for (const { mid, inward } of edges) {
      expect(terrain.heightAt([mid[0] + inward[0], mid[1] + inward[1]])).toBeCloseTo(level, 6);
      expect(terrain.heightAt([mid[0] - inward[0], mid[1] - inward[1]])).toBeLessThan(level - 5);
    }
    const ring = facePoints(next.mesh, next.mesh.faces[faceIds[0]]);
    expect(terrain.foundationAt(ring)).toBeCloseTo(level, 6);
    const meshes = createTownWater(next, terrain);
    expect(meshes.parent.getObjectByName("ce-escarpment")).toBeDefined();
    meshes.dispose();
  });
  it("runs an earth slope outside the cells, survives saving and goes with its castle", () => {
    const { doc, castle, faceIds, top } = study();
    const next = setCastlePlatform(doc, castle.id, { levelMeters: top, edge: { kind: "slope", runMeters: 20 } })!;
    const terrain = cityTerrain(next),
      level = top - terrain.datumMeters;
    expect(terrain.triangles.some(patch => patch.escarpment)).toBe(false);
    for (const { mid, inward } of rim(next, faceIds)) {
      expect(terrain.heightAt(mid)).toBeCloseTo(level, 6);
      expect(terrain.heightAt([mid[0] - inward[0] * 10, mid[1] - inward[1] * 10])).toBeLessThan(level - 1);
    }
    const loaded = parseDocument(JSON.stringify(next))!;
    expect(loaded.terrain).toEqual(next.terrain);
    expect(
      parseDocument(JSON.stringify({ ...next, terrain: { version: 1, features: [{ kind: "platform" }] } }))
    ).toBeNull();
    expect(setCastlePlatform(next, castle.id, null)!.terrain).toBeUndefined();
    expect(deleteCastle(next, castle.id)!.terrain).toBeUndefined();
  });
  it("keeps the edge between two platform cells level", () => {
    const { doc, faceIds, top } = study();
    const first = doc.mesh.faces[faceIds[0]];
    const shared = first.boundary
      .map(ref => doc.mesh.edges[ref.edgeId])
      .find(edge => {
        const other = edge.leftFace === first.id ? edge.rightFace : edge.leftFace;
        return other && doc.mesh.faces[other].properties.water === "land";
      })!;
    const pair = [first.id, shared.leftFace === first.id ? shared.rightFace! : shared.leftFace!];
    const next: CityDocument = {
      ...doc,
      terrain: {
        version: 1,
        features: [
          {
            kind: "platform",
            id: "p",
            summit: { kind: "faces", faceIds: pair },
            levelMeters: top,
            edge: { kind: "cliff" }
          }
        ]
      }
    };
    const terrain = cityTerrain(next),
      level = top - terrain.datumMeters;
    const a = doc.mesh.vertices[shared.a].point,
      b = doc.mesh.vertices[shared.b].point;
    expect(terrain.heightAt([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])).toBeCloseTo(level, 6);
    for (const { mid, inward } of rim(next, pair))
      expect(terrain.heightAt([mid[0] - inward[0], mid[1] - inward[1]])).toBeLessThan(level - 5);
  });
});
