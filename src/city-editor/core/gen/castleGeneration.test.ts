import { describe, expect, it } from "vitest";
import { setCastleLocked } from "../castles";
import { createGridDocument, parseDocument } from "../document";
import { boundaryEdges, circuitRing, polygonOverlaps, townGates } from "../fortifications";
import { defaultGenerationSettings, generateCityOnDocument, generateStageOnDocument } from "../generate";
import { facePoints, validate } from "../mesh";
import type { CastleSettings } from "../types";
import { buildBlockFabric } from "./blockInfill";
import { buildCityBuildings } from "./buildingLots";
import { terrainHeight } from "./castlePlacement";
import { polygonArea } from "./geom";

function settings(castle: Partial<CastleSettings> = {}) {
  const s = defaultGenerationSettings();
  s.castle = { size: "small", ...castle };
  s.config = {
    ...s.config,
    coast: "none",
    rivers: [],
    features: { walls: true, citadel: true, plaza: true, temple: true, port: false, shanty: false }
  };
  return s;
}
const modes: Partial<CastleSettings>[] = [
  { position: "edge", relationship: "integrated", form: "keep-bailey" },
  { position: "central", relationship: "detached", form: "courtyard" },
  { position: "edge", relationship: "detached", form: "keep-bailey" }
];

describe("Castle generation", () => {
  it.each(modes)(
    "completes %j with local access and no ordinary infill",
    castle => {
      const source = createGridDocument({ size: "small", grid: "voronoi", seed: "castle-mesh" }),
        s = settings(castle);
      const doc = generateCityOnDocument(source, s, "castle-test");
      expect(doc).not.toBeNull();
      expect(validate(doc!)).toEqual([]);
      const plan = doc!.castles![0],
        circuit = doc!.defenseCircuits!.find(c => c.id === plan.circuitId)!;
      expect(plan.position).toBe(castle.position);
      expect(plan.relationship).toBe(castle.relationship);
      expect(plan.form).toBe(castle.form);
      expect(townGates(doc!).every(g => !g.ownerCastleId)).toBe(true);
      expect(doc!.gates.length).toBe(townGates(doc!).length + 1);
      const gate = doc!.gates.find(g => g.ownerCastleId === plan.id)!;
      expect(
        doc!.featureGroups.some(
          g =>
            g.kind === "road" &&
            g.segments.some(r => {
              const e = doc!.mesh.edges[r.edgeId];
              return e.a === gate.vertexId || e.b === gate.vertexId;
            })
        )
      ).toBe(true);
      const ring = circuitRing(doc!, circuit),
        area = Math.abs(polygonArea(ring));
      expect(area).toBeGreaterThanOrEqual(2500);
      expect(area).toBeLessThanOrEqual(30000);
      expect(buildCityBuildings(doc!).some(b => polygonOverlaps(b.polygon, ring))).toBe(false);
      expect(buildBlockFabric(doc!).buildings.some(b => polygonOverlaps(b.polygon, ring))).toBe(false);
      expect(parseDocument(JSON.stringify(doc))).toEqual(doc);
      expect(JSON.stringify(source)).not.toContain("defenseCircuits");
    },
    30000
  );
  it("uses the same castle reservation for stages 4 and 6 on a hex mesh", () => {
    const source = createGridDocument({ size: "small", grid: "hex", hexSizeMeters: 50, seed: "ce-urban-area" });
    const s = settings();
    s.config.rivers = ["meander"];
    const a = generateStageOnDocument(source, s, "ce-urban-area", 4),
      b = generateStageOnDocument(source, s, "ce-urban-area", 6);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(validate(a!)).toEqual([]);
    expect(validate(b!)).toEqual([]);
    expect(a!.castles![0].position).toBe(b!.castles![0].position);
    expect(
      boundaryEdges(a!.mesh, a!.defenseCircuits!.find(c => c.scope === "castle")!.areaFaceIds).length
    ).toBeGreaterThan(3);
  });
  it("preserves a locked compound during a generation pass", () => {
    const source = createGridDocument({ size: "small", grid: "voronoi", seed: "castle-mesh" }),
      s = settings(modes[0]);
    const first = generateStageOnDocument(source, s, "castle-test", 6)!;
    const locked = setCastleLocked(first, first.castles![0].id, true)!;
    const next = generateStageOnDocument(locked, s, "castle-test", 6);
    expect(next).not.toBeNull();
    expect(next!.castles).toEqual(locked.castles);
    const circuit = locked.defenseCircuits!.find(c => c.scope === "castle")!;
    for (const id of circuit.areaFaceIds)
      expect(facePoints(next!.mesh, next!.mesh.faces[id])).toEqual(facePoints(locked.mesh, locked.mesh.faces[id]));
  });
  it("keeps the old generation path explicit", () => {
    const source = createGridDocument({ size: "small", grid: "voronoi", seed: "castle-mesh" }),
      s = settings();
    s.legacyCastles = true;
    const doc = generateStageOnDocument(source, s, "castle-test", 6);
    expect(doc).not.toBeNull();
    expect(doc!.castles).toBeUndefined();
    expect(doc!.version).toBe(1);
  });
  it.each(["micro", "tiny", "medium", "large"] as const)(
    "reserves a bounded standard compound on a %s evolution grid",
    size => {
      const source = createGridDocument({ size, grid: "evolution", seed: "castle-sizes" }),
        s = settings({ position: "edge", size: "standard" });
      const doc = generateStageOnDocument(source, s, "castle-size-test", 4);
      expect(doc).not.toBeNull();
      expect(validate(doc!)).toEqual([]);
      const area = Math.abs(polygonArea(circuitRing(doc!, doc!.defenseCircuits!.find(c => c.scope === "castle")!)));
      // Micro: every standard edge site sits on one of its four road corridors
      // (castle-road-siting-order.md C1/C2), so it falls back to the relaxed
      // detached compound rather than blocking a road.
      expect(area).toBeGreaterThanOrEqual(size === "micro" ? 1800 : 5000);
      expect(area).toBeLessThanOrEqual(30000);
    }
  );
  it("allows a central castle in a town without walls", () => {
    const source = createGridDocument({ size: "small", grid: "voronoi", seed: "castle-mesh" }),
      s = settings(modes[1]);
    s.config.features.walls = false;
    const doc = generateCityOnDocument(source, s, "castle-test");
    expect(doc).not.toBeNull();
    expect(doc!.castles).toHaveLength(1);
    expect(doc!.defenseCircuits!.some(c => c.scope === "town")).toBe(false);
    expect(townGates(doc!)).toHaveLength(0);
    expect(validate(doc!)).toEqual([]);
  });
  it("emits no castle when only the town wall is enabled", () => {
    const source = createGridDocument({ size: "small", grid: "voronoi", seed: "castle-mesh" }),
      s = settings();
    s.config.features.citadel = false;
    const doc = generateStageOnDocument(source, s, "castle-test", 4);
    expect(doc).not.toBeNull();
    expect(doc!.castles).toHaveLength(0);
    expect(doc!.defenseCircuits!.some(c => c.scope === "town")).toBe(true);
    expect(validate(doc!)).toEqual([]);
  });
  it("samples terrain heights in metres", () => {
    const terrain = {
      elevationMeters: 0,
      downhillAzimuthDeg: null,
      gradePercent: 0,
      heightfield: {
        size: 2,
        spacingMeters: 100,
        elevationsMeters: [0, 10, 20, 30],
        waterMask: [0, 0, 0, 0] as (0 | 1)[]
      }
    };
    expect(terrainHeight(terrain, [0, 0])).toBe(15);
    expect(terrainHeight(terrain, [-50, -50])).toBe(0);
    expect(terrainHeight(undefined, [0, 0])).toBeNull();
  });
});
