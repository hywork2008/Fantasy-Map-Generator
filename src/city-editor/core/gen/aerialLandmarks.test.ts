import { beforeAll, describe, expect, it } from "vitest";
import { renderEditorSvg } from "../../render/svg";
import { createGridDocument } from "../document";
import { featureGroupVertices } from "../features";
import { circuitRing, polygonOverlaps } from "../fortifications";
import { defaultGenerationSettings, generateCityOnDocument } from "../generate";
import type { CityDocument, Point } from "../types";
import { aerialLandmarkFootprints, buildAerialLandmarkPlan } from "./aerialLandmarks";
import { buildBlockFabric, type DistrictFabric } from "./blockInfill";
import { nearestOnPolyline, pointInPolygon } from "./geom";

function walledRiverTown(): CityDocument {
  const grid = createGridDocument({
    size: "medium",
    grid: "evolution",
    seed: "probe-a"
  });
  const settings = defaultGenerationSettings();
  settings.config.coast = "none";
  settings.config.rivers = ["meander"];
  settings.config.relief = true;
  settings.config.features = {
    walls: true,
    citadel: true,
    plaza: true,
    temple: true,
    port: false,
    shanty: false
  };
  const city = generateCityOnDocument(grid, settings, "probe-a");
  if (!city) throw new Error("generation failed");
  return city;
}

function centre(points: Point[]): Point {
  return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
}

function roadPolylines(city: CityDocument): Array<{ points: Point[]; width: number }> {
  return city.featureGroups
    .filter(g => g.kind === "road")
    .map(g => ({
      points: featureGroupVertices(city, g).map(id => city.mesh.vertices[id].point),
      width: g.style.widthMeters
    }));
}

describe("aerial landmarks (1008-wards-and-features priority list)", () => {
  let city: CityDocument;
  let fabric: DistrictFabric;
  let ring: Point[];
  beforeAll(() => {
    city = walledRiverTown();
    fabric = buildBlockFabric(city);
    ring = circuitRing(city, city.defenseCircuits!.find(c => c.scope === "town")!);
  }, 120000);

  it("places every landmark kind in a walled river town", () => {
    const plan = fabric.aerialLandmarks!;
    expect(plan.monasteries.length).toBeGreaterThanOrEqual(2);
    expect(plan.monasteries.some(m => m.kind === "friary")).toBe(true);
    expect(plan.monasteries.some(m => m.kind === "abbey")).toBe(true);
    expect(plan.windmills.length).toBeGreaterThan(0);
    expect(plan.barbicans.length).toBeGreaterThan(0);
    expect(plan.tanneries).toHaveLength(1);
    expect(plan.gallows).toHaveLength(1);
  });

  it("is deterministic for the same document and fabric", () => {
    expect(buildBlockFabric(city).aerialLandmarks).toEqual(fabric.aerialLandmarks);
  });

  it("clears houses, alleys and fields from every footprint", () => {
    const footprints = aerialLandmarkFootprints(fabric.aerialLandmarks!);
    for (const f of footprints) {
      expect(fabric.buildings.some(b => polygonOverlaps(b.polygon, f))).toBe(false);
      expect(fabric.farms.some(farm => polygonOverlaps(farm.polygon, f))).toBe(false);
    }
    for (const m of fabric.aerialLandmarks!.monasteries) {
      const inner = m.walk;
      expect(fabric.lanes.some(l => l.points.some(p => pointInPolygon(p, inner)))).toBe(false);
    }
  });

  it("keeps precincts and yards off streets and water", () => {
    const roads = roadPolylines(city);
    const plan = fabric.aerialLandmarks!;
    for (const polygon of [...plan.monasteries.map(m => m.precinct), ...plan.tanneries.map(t => t.yard)])
      for (const road of roads)
        for (const p of polygon) expect(nearestOnPolyline(p, road.points).dist).toBeGreaterThan(road.width / 2);
    const river = city.featureGroups.find(g => g.kind === "river")!;
    const riverPoints = river.kind === "river" ? river.vertices.map(id => city.mesh.vertices[id].point) : [];
    for (const m of plan.monasteries)
      for (const p of m.precinct)
        expect(nearestOnPolyline(p, riverPoints).dist).toBeGreaterThan(river.style.widthMeters / 2);
  });

  it("puts friaries near a gate inside the walls and abbeys outside", () => {
    const gates = city.gates.map(g => city.mesh.vertices[g.vertexId].point);
    for (const m of fabric.aerialLandmarks!.monasteries) {
      const c = centre(m.precinct);
      if (m.kind === "friary") {
        expect(pointInPolygon(c, ring)).toBe(true);
        expect(Math.min(...gates.map(g => Math.hypot(g[0] - c[0], g[1] - c[1])))).toBeLessThan(270);
      } else expect(pointInPolygon(c, ring)).toBe(false);
    }
  });

  it("sets windmills and the gallows outside the walls", () => {
    const plan = fabric.aerialLandmarks!;
    for (const w of plan.windmills) {
      expect(pointInPolygon(w.center, ring)).toBe(false);
      // One prevailing wind turns every mill the same way.
      expect(w.facing).toBe(plan.windmills[0].facing);
    }
    const gallows = plan.gallows[0];
    expect(pointInPolygon(gallows.center, ring)).toBe(false);
    expect(nearestOnPolyline(gallows.center, [...ring, ring[0]]).dist).toBeGreaterThan(120);
  });

  it("builds barbicans on the outer side of an external-road gate", () => {
    for (const b of fabric.aerialLandmarks!.barbicans) {
      const gate = city.gates.find(g => g.id === b.gateId)!;
      const at = city.mesh.vertices[gate.vertexId].point;
      const c = centre(b.court);
      expect(pointInPolygon(c, ring)).toBe(false);
      expect(Math.hypot(c[0] - at[0], c[1] - at[1])).toBeLessThan(40);
      expect(b.frontTowers).toHaveLength(2);
    }
  });

  it("puts the tanners' yard on the bank downstream of the town", () => {
    const river = city.featureGroups.find(g => g.kind === "river");
    if (river?.kind !== "river") throw new Error("no river");
    const points = river.vertices.map(id => city.mesh.vertices[id].point);
    const along = (p: Point) => {
      let best = { d: Infinity, s: 0 };
      let walked = 0;
      for (let i = 1; i < points.length; i++) {
        const hit = nearestOnPolyline(p, [points[i - 1], points[i]]);
        const s = walked + Math.hypot(hit.point[0] - points[i - 1][0], hit.point[1] - points[i - 1][1]);
        if (hit.dist < best.d) best = { d: hit.dist, s };
        walked += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      }
      return best;
    };
    const lastInTown = Math.max(...points.filter(p => pointInPolygon(p, ring)).map(p => along(p).s));
    const yard = fabric.aerialLandmarks!.tanneries[0];
    const at = along(centre(yard.yard));
    expect(at.s).toBeGreaterThan(lastInTown - 30);
    expect(at.d).toBeLessThan(river.style.widthMeters / 2 + 25);
    expect(yard.pits.length).toBeGreaterThan(20);
  });

  it("follows the technology of the historical period", () => {
    const input = {
      buildings: fabric.buildings,
      lanes: fabric.lanes,
      farms: fabric.farms.map(f => f.polygon),
      reserved: []
    };
    const early = buildAerialLandmarkPlan({ ...city, historicalPeriod: "earlyMedieval" }, input);
    expect(early.windmills).toHaveLength(0);
    expect(early.barbicans).toHaveLength(0);
    expect(early.monasteries.length).toBeGreaterThan(0);
    const antique = buildAerialLandmarkPlan({ ...city, historicalPeriod: "classicalAntiquity" }, input);
    expect(antique.monasteries).toHaveLength(0);
    const high = buildAerialLandmarkPlan({ ...city, historicalPeriod: "highMedieval" }, input);
    expect(high.windmills.every(w => w.kind === "post")).toBe(true);
  });

  it("renders pickable landmark groups", () => {
    const half = city.frame.extentMeters / 2;
    const svg = renderEditorSvg(
      { ...city, appearance: "town" },
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      `${-half} ${-half} ${half * 2} ${half * 2}`,
      1
    );
    for (const kind of ["monastery", "windmill", "barbican", "tannery", "gallows"]) {
      const node = svg.querySelector(`.ce-${kind}[data-pick]`);
      expect(node, kind).not.toBeNull();
      expect(JSON.parse(decodeURIComponent(node!.getAttribute("data-pick")!)).kind).toBe(kind);
    }
  }, 60000);
});
