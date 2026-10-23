import { describe, expect, it } from "vitest";
import { createTownWater } from "../../city3d/three/waterMeshes";
import { rampStructures } from "../renderers/terrainMassing";
import { parseDocument } from "../services/io/documentCodec";
import type { CityDocument } from "../types/document";
import { deleteCastle } from "./castles";
import { createFortressStudy } from "./fortressStudy";
import { pointInPolygon, polygonCentroid } from "./geom";
import { facePoints } from "./mesh";
import { RAMP_GRADE } from "./rampPlanning";
import { MAX_ROAD_GRADE } from "./roadGrading";
import { castleGatePoint, castleRamp, castleSiteFaceIds, setCastlePlatform } from "./terrainEditing";
import { cityTerrain } from "./terrainElevation";
import { collectTownRoads } from "./townRoads";

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

describe("graded roads over a castle platform", () => {
  const along = (terrain: ReturnType<typeof cityTerrain>) =>
    terrain.roads!.ribbons.flatMap(ribbon => {
      const out: Array<{ point: [number, number]; normal: [number, number]; half: number }> = [];
      for (let k = 1; k < ribbon.centerline.length; k++) {
        const a = ribbon.centerline[k - 1],
          b = ribbon.centerline[k];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let s = 0; s < length; s += 1)
          out.push({
            point: [a[0] + ((b[0] - a[0]) * s) / length, a[1] + ((b[1] - a[1]) * s) / length],
            normal: [-(b[1] - a[1]) / length, (b[0] - a[0]) / length],
            half: ribbon.widthMeters / 2
          });
      }
      return out;
    });
  it("ramps the gate road up an earth slope within the cart grade, level across its width", () => {
    const { doc, castle, top } = study();
    const next = setCastlePlatform(doc, castle.id, { levelMeters: top, edge: { kind: "slope", runMeters: 20 } })!;
    const roads = collectTownRoads(next, []);
    expect(roads.length).toBeGreaterThan(0);
    const terrain = cityTerrain(next, { roads });
    const samples = along(terrain);
    for (let k = 1; k < samples.length; k++) {
      const a = samples[k - 1].point,
        b = samples[k].point;
      const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (run > 1.01 || run < 0.5) continue;
      expect(Math.abs(terrain.heightAt(b) - terrain.heightAt(a))).toBeLessThanOrEqual(MAX_ROAD_GRADE.cart * run + 0.02);
    }
    for (const { point, normal, half } of samples) {
      const edge = (side: number) =>
        terrain.heightAt([point[0] + normal[0] * side * half * 0.95, point[1] + normal[1] * side * half * 0.95]);
      expect(edge(1)).toBeCloseTo(edge(-1), 1);
    }
  });
  it("stops the gate road at a cliff edge", () => {
    const { doc, castle, top } = study();
    const next = setCastlePlatform(doc, castle.id, { levelMeters: top, edge: { kind: "cliff" } })!;
    const terrain = cityTerrain(next, { roads: collectTownRoads(next, []) });
    expect(terrain.roads!.cliffBreaks.length).toBeGreaterThan(0);
  });
});

describe("castle ramp up a cliff", () => {
  const ramped = () => {
    const { doc, castle, faceIds, top } = study();
    const next = setCastlePlatform(doc, castle.id, { levelMeters: top, edge: { kind: "cliff" } })!;
    return { next, castle, faceIds, top, ramp: castleRamp(next, castle.id)! };
  };
  it("climbs from the ground to the gate at the ramp grade, outside the platform", () => {
    const { next, castle, faceIds, top, ramp } = ramped();
    expect(ramp).toBeDefined();
    const gate = castleGatePoint(next, castle)!;
    const landing = ramp.centerline.at(-1)!;
    expect(Math.hypot(landing[0] - gate[0], landing[1] - gate[1])).toBeLessThan(2);
    expect(ramp.elevationsMeters.at(-1)).toBeCloseTo(top, 6);
    const terrain = cityTerrain(next);
    const foot = ramp.centerline[0];
    expect(ramp.elevationsMeters[0]).toBeCloseTo(terrain.heightAt(foot) + terrain.datumMeters, 1);
    for (let i = 1; i < ramp.centerline.length; i++) {
      const run = Math.hypot(
        ramp.centerline[i][0] - ramp.centerline[i - 1][0],
        ramp.centerline[i][1] - ramp.centerline[i - 1][1]
      );
      expect(ramp.elevationsMeters[i] - ramp.elevationsMeters[i - 1]).toBeLessThanOrEqual(RAMP_GRADE * run + 1e-6);
    }
    const rings = faceIds.map(id => facePoints(next.mesh, next.mesh.faces[id]));
    for (const point of ramp.centerline.slice(0, -1))
      expect(rings.some(ring => pointInPolygon(point, ring))).toBe(false);
    // Roads ride the deck; the ground beneath keeps its height.
    const middle = ramp.centerline[Math.floor(ramp.centerline.length / 2)];
    expect(terrain.surfaceAt(middle)).toBeGreaterThan(terrain.heightAt(middle) + 1);
  });
  it("carries a road across the cliff that other roads may not cross, and builds a walled body", () => {
    const { next } = ramped();
    const roads = collectTownRoads(next, []);
    expect(roads.some(ribbon => ribbon.connectsLevels)).toBe(true);
    const terrain = cityTerrain(next, { roads });
    const deck = terrain.roads!.ribbons.find(ribbon => ribbon.connectsLevels)!;
    expect(deck.centerline.length).toBeGreaterThan(2);
    const parts = rampStructures(terrain);
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      const [low, high] = part.sections!;
      for (let i = 0; i < low.elevationsMeters.length; i++)
        expect(high.elevationsMeters[i]).toBeGreaterThan(low.elevationsMeters[i]);
    }
  });
  it("saves, rejects malformed ramps and goes with its castle", () => {
    const { next, castle } = ramped();
    expect(parseDocument(JSON.stringify(next))!.terrain).toEqual(next.terrain);
    const broken = structuredClone(next);
    broken.terrain!.ramps![0].elevationsMeters.pop();
    expect(parseDocument(JSON.stringify(broken))).toBeNull();
    expect(setCastlePlatform(next, castle.id, null)!.terrain).toBeUndefined();
    expect(deleteCastle(next, castle.id)!.terrain).toBeUndefined();
  });
});
