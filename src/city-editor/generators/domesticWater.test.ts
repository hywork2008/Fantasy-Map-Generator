import { describe, expect, it, vi } from "vitest";
import type { CityDocument, Point } from "../types/document";
import { placeDomesticWater, type WaterSite } from "./domesticWater";
import { polygonOverlaps } from "./fortifications";
import { NearbyPolylineIndex } from "./nearbyPolylineIndex";

function scenario() {
  const points: Point[] = [
    [-40, -40],
    [40, -40],
    [40, 40],
    [-40, 40]
  ];
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 4,
    frame: { extentMeters: 200, cityRadiusMeters: 40, blockSizeMeters: 80 },
    mesh: {
      vertices: Object.fromEntries(points.map((point, i) => [`v${i}`, { id: `v${i}`, point, locked: false }])),
      edges: Object.fromEntries(
        points.map((_, i) => [
          `e${i}`,
          { id: `e${i}`, a: `v${i}`, b: `v${(i + 1) % 4}`, leftFace: "f", rightFace: null, locked: false }
        ])
      ),
      faces: {
        f: {
          id: "f",
          boundary: points.map((_, i) => ({ edgeId: `e${i}`, forward: true })),
          properties: {
            water: "land",
            elevation: 10,
            ward: "merchant",
            settlement: "outskirts",
            locked: false,
            buildable: true
          }
        }
      }
    },
    featureGroups: [],
    gates: [],
    elements: []
  };
  const claimed: Point[][] = [];
  const site: WaterSite = {
    document,
    inFrame: () => true,
    hitsWater: () => false,
    hitsRoutes: () => false,
    hitsBlocked: polygon => claimed.some(p => polygonOverlaps(p, polygon)),
    buildingsIn: () => [],
    hitsLanes: () => false,
    farmsIn: () => [],
    claim: polygon => {
      claimed.push(polygon);
    }
  };
  const routes = [-37, 37].map(x => ({
    points: [
      [x, -40],
      [x, 40]
    ] as Point[],
    widthMeters: 1
  }));
  return { site, routes, document };
}

describe("domestic water source and access policy", () => {
  it("places one public basin in each accessible plaza with a street connection", () => {
    const { site, routes, document } = scenario();
    document.elements.push({ id: "plaza", kind: "plaza", faceIds: [], point: [0, 0], sizeMeters: 16, locked: false });
    const plan = placeDomesticWater(site, routes, 80);
    const basins = plan.filter(water => water.placement === "plaza");
    expect(basins).toHaveLength(1);
    expect(basins[0]).toMatchObject({ kind: "publicBasin", center: [0, 0], radius: 1.7, use: "domestic" });
    expect(basins[0].access).toHaveLength(2);
    expect(plan.filter(water => water.kind === "well")).toHaveLength(0);
  });
  it("omits a plaza basin when its ground or street access is obstructed", () => {
    for (const blocked of [true, false]) {
      const { site, routes, document } = scenario();
      document.elements.push({ id: "plaza", kind: "plaza", faceIds: [], point: [0, 0], locked: false });
      if (blocked) site.hitsBlocked = () => true;
      expect(placeDomesticWater(site, blocked ? routes : [], 80).some(water => water.kind === "publicBasin")).toBe(
        false
      );
    }
  });
  it("requires a reachable street even when vacant ground exists", () => {
    const { site } = scenario();
    expect(placeDomesticWater(site, [], 500)).toEqual([]);
  });
  it("does not place water points on occupied ground", () => {
    const { site, routes } = scenario();
    site.buildingsIn = () => [{}];
    expect(placeDomesticWater(site, routes, 500)).toEqual([]);
  });
  it("keeps peripheral ponds separate from domestic collection points", () => {
    const { site, routes } = scenario();
    const plan = placeDomesticWater(site, routes, 80);
    expect(plan.some(p => p.kind === "well")).toBe(true);
    expect(plan.some(p => p.kind === "pond" && p.use === "service")).toBe(true);
    expect(plan.some(p => p.kind === "spring")).toBe(false);
    expect(polygonOverlaps(plan[0].footprint, plan.at(-1)!.footprint)).toBe(false);
  });
  it("uses a spring basin only beside an explicit spring source", () => {
    const { site, routes, document } = scenario();
    document.mesh.vertices.source = { id: "source", point: [30, 5], locked: false };
    document.featureGroups.push({
      id: "spring-river",
      kind: "river",
      name: "Spring",
      vertices: ["source"],
      source: { vertexId: "source", kind: "spring" },
      mouth: null,
      style: { widthMeters: 1, color: "blue" },
      locked: false
    });
    expect(placeDomesticWater(site, routes, 80).some(p => p.kind === "spring")).toBe(true);
  });
});

// Infinite bounds reproduce the previous exhaustive route scan.
it("preserves water placement and access with exhaustive route candidates", () => {
  const indexed = scenario();
  const expected = placeDomesticWater(indexed.site, indexed.routes, 500);
  const query = NearbyPolylineIndex.prototype.query;
  const spy = vi.spyOn(NearbyPolylineIndex.prototype, "query").mockImplementation(function (point) {
    return query.call(this, point, Infinity);
  });
  try {
    const exhaustive = scenario();
    expect(placeDomesticWater(exhaustive.site, exhaustive.routes, 500)).toEqual(expected);
  } finally {
    spy.mockRestore();
  }
});
