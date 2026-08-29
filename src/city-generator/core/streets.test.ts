// M5 — S5 streets (design §4.2 S5). Gate → plaza streets stay inside the wall
// and are not drawn; extramural roads run window-edge → gate and are; `arteries`
// is the tidied union, smoothed with its endpoints held fixed.

import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_CONFIG } from "../site/siteConfig";
import { siteToGeography, siteToParams, siteToProgram } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { close } from "./interior";
import { generateCity } from "./pipeline";
import { foldArteriesIntoCells, reservedStreetVertices, tidyUpRoads } from "./streets";
import type { BorderLoop, Cell, Gate, Point } from "./types";

function run(seed: string) {
  const config = {
    ...DEFAULT_SITE_CONFIG,
    coast: "none" as const,
    rivers: [],
    relief: false,
    features: { ...DEFAULT_SITE_CONFIG.features, walls: true, plaza: true, citadel: true }
  };
  const site = synthSite("smallCity", config, seed);
  return generateCity(siteToParams(site), siteToGeography(site), siteToProgram(site));
}

const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const near = (p: Point, q: Point): number => Math.hypot(p[0] - q[0], p[1] - q[1]);

describe("S5 streets", () => {
  it("routes a street from every gate to the plaza", () => {
    const r = run("s5-plaza");
    const cs = r.params.cellSizeMeters;
    const plaza = r.precincts.find(p => p.kind === "plaza");
    expect(plaza).toBeTruthy();
    expect(r.gates.length).toBeGreaterThan(0);

    for (const gate of r.gates) {
      const street = r.streets.streets.find(line => near(line[0], gate.point) < cs * 1.5);
      expect(street, `a street leaves gate ${gate.point.join()}`).toBeTruthy();
      // …and its other end lands on the plaza.
      expect(near(street!.at(-1) as Point, plaza!.anchor)).toBeLessThan(cs * 2.5);
    }
  });

  it("keeps every street inside the wall and clear of the citadel enceinte", () => {
    const r = run("s5-mask");
    const citadelRing = r.steps.find(s => s.label === "S5 · Streets")?.overlays.find(o => o.kind === "citadelWall")
      ?.points as Point[];
    expect(citadelRing).toBeTruthy();
    const cs = r.params.cellSizeMeters;
    // "not outside": inside a wall ring, or hugging its line (spur-gate streets).
    const enclosed = (m: Point): boolean =>
      r.borders.some(b => pointInPolygon(m, close(b.points)) || nearestOnPolyline(m, close(b.points)).dist < cs * 0.5);

    expect(r.streets.streets.length).toBeGreaterThan(0);
    for (const line of r.streets.streets) {
      for (let i = 0; i + 1 < line.length; i++) {
        const m = mid(line[i], line[i + 1]);
        expect(enclosed(m), `seg ${i} does not cross the wall`).toBe(true);
        expect(pointInPolygon(m, citadelRing), `seg ${i} clear of the citadel`).toBe(false);
      }
    }
  });

  it("routes an extramural road from the window edge to each land gate", () => {
    const r = run("s5-roads");
    const cs = r.params.cellSizeMeters;
    const half = r.params.extentMeters / 2;
    const landGates = r.gates.filter(g => !g.water);
    const edgeGap = (p: Point): number => Math.min(half - Math.abs(p[0]), half - Math.abs(p[1]));

    expect(r.streets.roads.length).toBeGreaterThan(0);
    expect(r.streets.roads.length).toBeLessThanOrEqual(landGates.length);
    for (const road of r.streets.roads) {
      expect(edgeGap(road[0]), "road starts at the window edge").toBeLessThan(cs * 3);
      expect(
        Math.min(...landGates.map(g => near(g.point, road.at(-1) as Point))),
        "road ends on a land gate"
      ).toBeLessThan(cs * 1.5);
      // The road runs outside the wall (bar the hop that meets the gate).
      const inside = road
        .slice(0, -1)
        .filter((p, i) => r.borders.some(b => pointInPolygon(mid(p, road[i + 1]), close(b.points))));
      expect(inside.length).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic", () => {
    expect(JSON.stringify(run("s5-det").streets)).toEqual(JSON.stringify(run("s5-det").streets));
  });

  it("draws the extramural roads but not the intramural streets", () => {
    const r = run("s5-render");
    const s5 = r.steps.find(s => s.label === "S5 · Streets");
    expect(s5?.label).toBe("S5 · Streets");
    expect(s5?.paths.filter(p => p.kind === "road")).toHaveLength(r.streets.roads.length);
    expect(s5?.paths.some(p => p.kind === "street")).toBe(false);
  });
});

describe("tidyUpRoads", () => {
  it("splits at a junction, preserves endpoints, smooths the interior", () => {
    const west: Point[] = [
      [0, 0],
      [5, 2],
      [10, 0]
    ];
    const east: Point[] = [
      [10, 0],
      [15, 2],
      [20, 0]
    ];
    const north: Point[] = [
      [10, 0],
      [8, 5],
      [10, 10]
    ];
    const arteries = tidyUpRoads([west, east, north], [], 1);

    expect(arteries).toHaveLength(3);
    const atJunction = (p: Point): boolean => near(p, [10, 0]) < 1e-9;
    for (const art of arteries) {
      expect(atJunction(art[0]) || atJunction(art.at(-1) as Point)).toBe(true);
    }

    const w = arteries.find(a => a.some(p => near(p, [0, 0]) < 1e-9)) as Point[];
    const ends = [w[0], w.at(-1) as Point];
    expect(ends.some(p => near(p, [0, 0]) < 1e-9)).toBe(true);
    expect(ends.some(p => near(p, [10, 0]) < 1e-9)).toBe(true);
    // interior vertex pulled off the raw (5, 2) by the Laplacian smooth
    expect(w[1][0]).toBeCloseTo(5, 5);
    expect(w[1][1]).toBeGreaterThan(0);
    expect(w[1][1]).toBeLessThan(2);
  });

  it("drops segments that bound the plaza", () => {
    const plaza: Point[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1]
    ];
    // A street that runs along the plaza's south edge then out to the east.
    const chain: Point[] = [
      [-1, -1],
      [1, -1],
      [4, -1],
      [8, -1]
    ];
    const arteries = tidyUpRoads([chain], [plaza], 1);
    const kept = arteries.flat();
    // the [-1,-1] → [1,-1] hop is a plaza edge and must be gone
    expect(kept.some(p => near(p, [-1, -1]) < 1e-9)).toBe(false);
    expect(kept.some(p => near(p, [8, -1]) < 1e-9)).toBe(true);
  });
});

describe("foldArteriesIntoCells", () => {
  const qkey = (p: Point): string => `${Math.round(p[0] / 0.05)},${Math.round(p[1] / 0.05)}`;
  const cell = (id: number, polygon: Point[]): Cell => ({
    id,
    polygon,
    site: polygonCentroid(polygon),
    centroid: polygonCentroid(polygon),
    neighbors: [],
    onBorder: false
  });

  it("moves a street vertex shared by two cells and recomputes the centroid", () => {
    const left = cell(1, [
      [0, 0],
      [10, 0],
      [10, 4],
      [0, 8]
    ]);
    const right = cell(2, [
      [10, 0],
      [22, 0],
      [22, 8],
      [10, 4]
    ]);
    const shifts = new Map<string, Point>([[qkey([10, 4]), [10, 0.5]]]);

    const [l2, r2] = foldArteriesIntoCells([left, right], shifts, new Set());
    expect(l2.polygon.some(p => near(p, [10, 0.5]) < 1e-9)).toBe(true);
    expect(r2.polygon.some(p => near(p, [10, 0.5]) < 1e-9)).toBe(true);
    expect(l2.polygon.some(p => near(p, [10, 4]) < 1e-9)).toBe(false);
    expect(near(l2.centroid, left.centroid)).toBeGreaterThan(0);
  });

  it("pins reserved keys; returns untouched cells and an untouched list by reference", () => {
    const a = cell(1, [
      [0, 0],
      [10, 0],
      [10, 4],
      [0, 8]
    ]);
    const shifts = new Map<string, Point>([[qkey([10, 4]), [10, 0.5]]]);
    expect(foldArteriesIntoCells([a], shifts, new Set([qkey([10, 4])]))[0]).toBe(a);

    const b = cell(2, [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ]);
    expect(foldArteriesIntoCells([b], shifts, new Set())[0]).toBe(b);

    const list = [a, b];
    expect(foldArteriesIntoCells(list, new Map(), new Set())).toBe(list);
  });
});

describe("reservedStreetVertices", () => {
  const key = (p: Point): string => `${Math.round(p[0] / 0.05)},${Math.round(p[1] / 0.05)}`;
  it("keys the perimeter, citadel and gate vertices, and nothing else", () => {
    const borders: BorderLoop[] = [
      {
        points: [
          [0, 0],
          [10, 0],
          [10, 10]
        ],
        segments: ["land", "land", "land"],
        urbanCellIds: []
      }
    ];
    const citadel: Point[] = [
      [5, 5],
      [6, 5]
    ];
    const gates: Gate[] = [{ point: [0, 0], borderIndex: 0, water: false }];
    const set = reservedStreetVertices(borders, citadel, gates);
    expect(set.has(key([10, 10]))).toBe(true);
    expect(set.has(key([5, 5]))).toBe(true);
    expect(set.has(key([0, 0]))).toBe(true);
    expect(set.has(key([99, 99]))).toBe(false);
  });
});

describe("S5 streets fold into the fabric (TownGeneratorTS 2.4)", () => {
  const s4Of = (r: ReturnType<typeof run>) =>
    new Map(r.steps.find(s => s.label === "S4 · Inner perimeter & gates")!.cells.map(c => [c.id, c.polygon] as const));

  it("moves only street-adjacent vertices, onto a street route, without inverting cells", () => {
    const r = run("s5-fold");
    const cs = r.params.cellSizeMeters;
    const s4 = s4Of(r);
    const routes = [...r.streets.streets, ...r.streets.arteries];

    const changed = r.steps.at(-1)!.cells.filter(c => {
      const before = s4.get(c.id);
      return before && JSON.stringify(before) !== JSON.stringify(c.polygon);
    });
    expect(changed.length).toBeGreaterThan(0);

    for (const c of changed) {
      const before = s4.get(c.id) as Point[];
      const ratio = Math.abs(polygonArea(c.polygon)) / Math.max(Math.abs(polygonArea(before)), 1);
      expect(ratio).toBeGreaterThan(0.6);
      expect(ratio).toBeLessThan(1.4);
      for (const p of c.polygon) {
        if (before.some(q => near(p, q) < 1e-6)) continue; // vertex did not move
        expect(Math.min(...routes.map(a => nearestOnPolyline(p, a).dist))).toBeLessThan(cs);
      }
    }
  });

  it("keeps the raw junction-optimised grid in the S0–S4 snapshots", () => {
    const r = run("s5-fold-pre");
    const s4 = r.steps.find(s => s.label === "S4 · Inner perimeter & gates")!.cells;
    const s7 = new Map(r.steps.at(-1)!.cells.map(c => [c.id, c.polygon]));
    const diff = s4.filter(c => JSON.stringify(c.polygon) !== JSON.stringify(s7.get(c.id)));
    expect(diff.length).toBeGreaterThan(0); // S4 kept its pre-fold geometry; only S5+ folded
  });

  it("is deterministic through S7", () => {
    expect(JSON.stringify(run("s5-fold-det").steps.at(-1)!.cells)).toEqual(
      JSON.stringify(run("s5-fold-det").steps.at(-1)!.cells)
    );
  });
});
