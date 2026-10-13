import { describe, expect, it } from "vitest";
import { createGridDocument } from "./document";
import { boundaryEdges, innerTownCircuit, outerTownCircuit, townCircuits, townGates } from "./fortifications";
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
});
