import { describe, expect, it } from "vitest";
import type { CityDocument, EdgeFeatureGroup, EdgeRef } from "../types/document";
import { normalizeGeneratedRoadOwnership } from "./generatedRoadOwnership";
import { countExternalApproachRoads } from "./generation/routing/roadCounts";
import { validate } from "./mesh";
import { roadPathVertices } from "./roadNetwork";

const refs = (...ids: string[]): EdgeRef[] =>
  ids.map(id => ({ edgeId: id.replace("-", ""), forward: !id.startsWith("-") }));
const road = (id: string, segments: EdgeRef[], widthMeters = 4): EdgeFeatureGroup => ({
  id,
  kind: "road",
  name: id,
  segments,
  style: { widthMeters, color: "#735238" },
  locked: false
});
function document(groups: EdgeFeatureGroup[]): CityDocument {
  const pairs = ["AB", "BC", "CD", "DE", "EF", "BI", "IC", "DJ", "JE", "DA"];
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 400, cityRadiusMeters: 120, blockSizeMeters: 40 },
    mesh: {
      vertices: Object.fromEntries(
        ["A", "B", "C", "D", "E", "F", "I", "J"].map((id, i) => [
          id,
          {
            id,
            point: [i * 20, (i % 2) * 20],
            locked: false
          }
        ])
      ),
      edges: Object.fromEntries(
        pairs.map(id => [id, { id, a: id[0], b: id[1], leftFace: null, rightFace: null, locked: false }])
      ),
      faces: {}
    },
    featureGroups: groups,
    gates: [],
    elements: []
  };
}
function edges(city: CityDocument): string[] {
  return city.featureGroups.flatMap(group => (group.kind === "road" ? group.segments.map(ref => ref.edgeId) : []));
}

describe("generated street ownership", () => {
  it("does not count the original street ID as an approach after removing its shared tail", () => {
    const city = document([road("gc:road-0", refs("BC")), road("gc:road-1", refs("AB", "BC"))]);
    city.mesh.vertices.A.point = [120, 0];
    city.mesh.vertices.B.point = [40, 0];
    city.mesh.vertices.C.point = [0, 0];
    expect(countExternalApproachRoads(city)).toBe(0);
    normalizeGeneratedRoadOwnership(city);
    expect(city.featureGroups.find(group => group.id === "gc:road-1")).toMatchObject({
      segments: refs("AB"),
      roadRole: "street"
    });
    expect(countExternalApproachRoads(city)).toBe(0);
    expect(countExternalApproachRoads(JSON.parse(JSON.stringify(city)))).toBe(0);
  });

  it("uses the planned purpose for streets ending at a junction outside the core", () => {
    const city = document([road("gc:road-0", refs("AB")), road("gc:road-1", refs("CD"))]);
    for (const [id, x] of [
      ["A", 120],
      ["B", 40],
      ["C", 160],
      ["D", 80]
    ] as const)
      city.mesh.vertices[id].point = [x, 0];
    const [street, approach] = city.featureGroups;
    if (street.kind !== "road" || approach.kind !== "road") throw new Error("Expected roads");
    street.roadRole = "street";
    approach.roadRole = "approach";
    expect(countExternalApproachRoads(city)).toBe(1);
  });

  it("does not count split street parts as new external entrances", () => {
    const city = document([
      road("gc:road-0", refs("AB")),
      road("gc:road-1:part-1", refs("CD")),
      road("gc:road-1:part-2", refs("EF"))
    ]);
    for (const [id, x] of [
      ["A", 40],
      ["B", 80],
      ["C", 120],
      ["D", 160],
      ["E", 180],
      ["F", 200]
    ] as const)
      city.mesh.vertices[id].point = [x, 0];
    expect(countExternalApproachRoads(city)).toBe(1);
  });

  it("removes every shared prefix, middle interval, suffix and reversed duplicate while preserving the edge union", () => {
    const city = document([
      road("gc:road-6", refs("AB", "BC", "CD", "DE", "EF")),
      road("gc:road-9", refs("AB", "BI", "IC", "CD", "DJ", "JE", "EF")),
      road("gc:road-10", refs("-EF", "-DE", "-CD", "-BC", "-AB"))
    ]);
    const union = new Set(edges(city));
    const report = normalizeGeneratedRoadOwnership(city);
    expect(new Set(edges(city))).toEqual(union);
    expect(edges(city)).toHaveLength(union.size);
    expect(report.removedRoadGroups).toBe(1);
    expect(
      city.featureGroups.filter(g => g.id.startsWith("gc:road-9")).map(g => g.kind === "road" && g.segments)
    ).toEqual([refs("BI", "IC"), refs("DJ", "JE")]);
    expect(validate(city)).toEqual([]);
    const once = structuredClone(city);
    expect(normalizeGeneratedRoadOwnership(city)).toEqual({
      removedRoadReferences: 0,
      removedRoadGroups: 0,
      splitRoadGroups: 0
    });
    expect(city).toEqual(once);
  });

  it("retains maximum generated width and registers new duplicates introduced by a later repair only once", () => {
    const city = document([road("gc:road-4", refs("AB", "BC", "CD")), road("gc:road-8", refs("-BC"), 8)]);
    normalizeGeneratedRoadOwnership(city);
    const wide = city.featureGroups.find(g => g.id === "gc:road-8")!;
    expect(wide.style.widthMeters).toBe(8);
    expect(wide.kind === "road" && wide.segments).toEqual(refs("-BC"));
    city.featureGroups.push(road("gc:road-11", refs("BC", "CD", "DE")));
    normalizeGeneratedRoadOwnership(city);
    const repaired = city.featureGroups.find(g => g.id === "gc:road-11")!;
    expect(repaired.kind === "road" && repaired.segments).toEqual(refs("DE"));
    expect(new Set(edges(city)).size).toBe(edges(city).length);
  });

  it("keeps a real ring connected across its serialization seam", () => {
    const city = document([road("gc:road-1", refs("BC")), road("gc:ring-road-0", refs("AB", "BC", "CD", "DA"))]);
    const union = new Set(edges(city));
    normalizeGeneratedRoadOwnership(city);
    const ring = city.featureGroups.find(g => g.id === "gc:ring-road-0")!;
    expect(ring.kind === "road" && roadPathVertices(city.mesh, ring.segments)).toEqual(["C", "D", "A", "B"]);
    expect(new Set(edges(city))).toEqual(union);
    expect(validate(city)).toEqual([]);
  });

  it.each(["manual", "locked", "source", "beyond", "bridge", "preserved", "approach"])(
    "preserves the authoritative %s road and removes its copy from an ordinary street",
    kind => {
      const fixed = road(
        kind === "manual" ? "manual-road" : kind === "bridge" ? "gc:bridge-0" : "gc:road-0",
        refs("AB", "BC")
      );
      if (kind === "locked") fixed.locked = true;
      if (kind === "source") fixed.sourceRoad = { index: 0, routeId: 7 };
      if (kind === "beyond") fixed.beyond = "city";
      if (kind === "approach") fixed.roadRole = "approach";
      const before = structuredClone(fixed);
      const city = document([road("gc:road-1", refs("AB", "BC", "CD")), fixed]);
      normalizeGeneratedRoadOwnership(city, kind === "preserved" ? new Set([fixed.id]) : undefined);
      expect(city.featureGroups.find(g => g.id === fixed.id)).toEqual(before);
      const generated = city.featureGroups.find(g => g.id === "gc:road-1")!;
      expect(generated.kind === "road" && generated.segments).toEqual(refs("CD"));
      expect(new Set(edges(city)).size).toBe(edges(city).length);
    }
  );
});
