import { describe, expect, it } from "vitest";
import { createGridDocument } from "./document";
import {
  boundaryEdges,
  innerTownCircuit,
  outerTownCircuit,
  reservedCastleFaces,
  townCircuits,
  townGates
} from "./fortifications";
import { INNER_WALL_FAILURES, innerTownCapacity } from "./gen/innerTownWall";
import { innerWalledAreaShare, outerWalledAreaShare } from "./gen/settlementExtent";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";
import { validate } from "./mesh";
import { kindEdgeIds } from "./passages";

describe("double town walls (P1)", () => {
  it("encloses the whole town in the outer wall and sizes the old town by the walled share", () => {
    expect(outerWalledAreaShare({ townWallRings: "double", walledAreaShare: 0.3 }, 2400)).toBe(1);
    expect(outerWalledAreaShare({ walledAreaShare: 0.3 }, 2400)).toBe(0.3);
    expect(innerWalledAreaShare(0.3, 2400)).toBe(0.3);
    // Small windows default to a 100% curtain; the old town falls back to 45%.
    expect(innerWalledAreaShare(undefined, 1200)).toBe(0.45);
    expect(innerWalledAreaShare(undefined, 2400)).toBe(0.45);
  });

  it("generates an old-town wall with gates on every street through it", () => {
    const seed = "d1";
    const city = generateCityOnDocument(
      createGridDocument({ size: "small", grid: "voronoi", seed }),
      { ...defaultGenerationSettings(), townWallRings: "double" },
      seed
    );
    expect(city).not.toBeNull();
    expect(validate(city!)).toEqual([]);
    const rings = townCircuits(city!);
    expect(rings.map(c => c.ring)).toEqual([0, 1]);
    const inner = innerTownCircuit(city!)!;
    const outer = outerTownCircuit(city!)!;
    const outerFaces = new Set(outer.areaFaceIds);
    expect(inner.areaFaceIds.every(id => outerFaces.has(id))).toBe(true);
    expect(inner.areaFaceIds.length).toBeLessThan(outer.areaFaceIds.length);
    for (const id of inner.areaFaceIds) expect(city!.mesh.faces[id].properties.wallRing).toBe(0);

    const gates = townGates(city!, inner.id);
    expect(gates.length).toBeGreaterThanOrEqual(2);
    expect(gates.every(g => g.circuitId === inner.id)).toBe(true);
    // Legacy outer gates keep no circuit id and still resolve to the outer wall.
    expect(townGates(city!, outer.id).length).toBeGreaterThanOrEqual(2);

    // No street is walled over by the old-town curtain.
    const roads = kindEdgeIds(city!, "road");
    const curtain = new Set(
      city!.featureGroups
        .filter(g => g.kind === "wall" && inner.wallGroupIds.includes(g.id))
        .flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : []))
    );
    expect([...curtain].filter(id => roads.has(id))).toEqual([]);
    expect(boundaryEdges(city!.mesh, inner.areaFaceIds).length).toBeGreaterThan(0);
  });

  it("leaves the single-wall default unchanged", () => {
    const seed = "d1";
    const city = generateCityOnDocument(
      createGridDocument({ size: "small", grid: "voronoi", seed }),
      defaultGenerationSettings(),
      seed
    );
    expect(townCircuits(city!)).toHaveLength(1);
    expect(townCircuits(city!)[0].ring).toBeUndefined();
    expect(Object.values(city!.mesh.faces).some(f => f.properties.wallRing !== undefined)).toBe(false);
  });

  it("stands the castle in the old town: town, old-town and castle curtains (P2)", () => {
    const seed = "d1";
    const settings = { ...defaultGenerationSettings(), townWallRings: "double" as const };
    settings.config.features = { ...settings.config.features, walls: true, citadel: true };
    const samples: Record<string, number>[] = [];
    const city = generateCityOnDocument(
      createGridDocument({ size: "small", grid: "voronoi", seed }),
      settings,
      seed,
      s => {
        if (s.phase === "inner-wall" && s.counts) samples.push(s.counts);
      }
    );
    expect(city).not.toBeNull();
    expect(validate(city!)).toEqual([]);
    expect(samples.at(-1)).toMatchObject({ ok: 1, castleInOldTown: 1, castleTouchesOldTown: 1 });
    const inner = new Set(innerTownCircuit(city!)!.areaFaceIds);
    const castle = reservedCastleFaces(city!);
    expect(castle.size).toBeGreaterThan(0);
    const touches = [...castle].some(id =>
      city!.mesh.faces[id].boundary.some(ref => {
        const edge = city!.mesh.edges[ref.edgeId];
        return [edge.leftFace, edge.rightFace].some(f => f && inner.has(f));
      })
    );
    expect(touches).toBe(true);
    expect(innerTownCapacity(city!.mesh, inner, castle).ok).toBe(true);
    expect(city!.defenseCircuits!.filter(c => c.scope === "castle")).toHaveLength(1);
    expect(townCircuits(city!)).toHaveLength(2);
  });

  it("keeps a micro town single-walled when no old town fits (§5.3)", () => {
    const seed = "d1";
    const samples: Record<string, number>[] = [];
    const city = generateCityOnDocument(
      createGridDocument({ size: "micro", grid: "voronoi", seed }),
      { ...defaultGenerationSettings(), townWallRings: "double" },
      seed,
      s => {
        if (s.phase === "inner-wall" && s.counts) samples.push(s.counts);
      }
    );
    expect(city).not.toBeNull();
    expect(townCircuits(city!)).toHaveLength(1);
    expect(samples.at(-1)).toMatchObject({ ok: 0, planned: 0, failureCode: INNER_WALL_FAILURES.indexOf("gap") + 1 });
  });
});
