// M5 — S5 streets (design §4.2 S5). Gate → plaza streets stay inside the wall
// and are not drawn; extramural roads run window-edge → gate and are; `arteries`
// is the tidied union, smoothed with its endpoints held fixed.

import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_CONFIG } from "../site/siteConfig";
import { siteToGeography, siteToParams, siteToProgram } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { nearestOnPolyline, pointInPolygon } from "./geom";
import { close } from "./interior";
import { generateCity } from "./pipeline";
import { tidyUpRoads } from "./streets";
import type { Point } from "./types";

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
