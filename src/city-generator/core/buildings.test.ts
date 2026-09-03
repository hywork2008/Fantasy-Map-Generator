// M7 — S7 lots (design §4.2 S7). Setback by edge kind, convex shrink / concave
// buffer, empty Ward emits no buildings.

import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_CONFIG } from "../site/siteConfig";
import { siteToGeography, siteToParams, siteToProgram } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { ALLEY, MAIN_STREET, REGULAR_STREET } from "./buildings";
import { bufferPolygon, nearestOnPolyline, pointInPolygon, polygonArea, polygonIsConvex, shrinkPolygon } from "./geom";
import { close } from "./interior";
import { generateCity } from "./pipeline";
import type { Point } from "./types";

function run(seed: string, features: Partial<(typeof DEFAULT_SITE_CONFIG)["features"]> = {}) {
  const config = {
    ...DEFAULT_SITE_CONFIG,
    coast: "none" as const,
    rivers: [] as const,
    relief: false,
    features: {
      ...DEFAULT_SITE_CONFIG.features,
      walls: true,
      plaza: true,
      citadel: true,
      temple: true,
      shanty: true,
      port: false,
      ...features
    }
  };
  const site = synthSite("smallCity", config, seed);
  return generateCity(siteToParams(site), siteToGeography(site), siteToProgram(site));
}

const square: Point[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10]
];

describe("polygon inset", () => {
  it("shrinks a convex square by a uniform offset", () => {
    expect(polygonIsConvex(square)).toBe(true);
    const inset = shrinkPolygon(square, [1, 1, 1, 1]);
    expect(inset.length).toBeGreaterThanOrEqual(3);
    expect(polygonIsConvex(inset)).toBe(true);
    expect(Math.abs(polygonArea(inset))).toBeGreaterThan(50);
    expect(Math.abs(polygonArea(inset))).toBeLessThan(Math.abs(polygonArea(square)));
    const c: Point = [5, 5];
    expect(pointInPolygon(c, inset)).toBe(true);
    for (const p of inset) expect(pointInPolygon(p, square)).toBe(true);
  });

  it("buffers a concave dart to a smaller interior ring", () => {
    const dart: Point[] = [
      [0, 0],
      [10, 0],
      [6, 3],
      [10, 6],
      [0, 6]
    ];
    expect(polygonIsConvex(dart)).toBe(false);
    const inset = bufferPolygon(
      dart,
      dart.map(() => 0.6)
    );
    expect(inset.length).toBeGreaterThanOrEqual(3);
    expect(Math.abs(polygonArea(inset))).toBeGreaterThan(4);
    expect(Math.abs(polygonArea(inset))).toBeLessThan(Math.abs(polygonArea(dart)));
  });
});

describe("S7 lots", () => {
  it("is deterministic", () => {
    expect(JSON.stringify(run("s7-det").buildings)).toEqual(JSON.stringify(run("s7-det").buildings));
  });

  it("emits no buildings for an empty Ward", () => {
    const r = run("s7-empty2");
    const emptyIds = new Set(r.wards.filter(w => w.kind === "empty").map(w => w.cellId));
    expect(emptyIds.size).toBeGreaterThan(0);
    expect(r.buildings.every(b => !emptyIds.has(b.cellId))).toBe(true);
  });

  it("sets wall / inner / outskirts setbacks at least half a street width", () => {
    const r = run("s7-setback");
    // Measure against the cells buildGeometry actually inset from — the final
    // snapshot carries the S5 street-folded polygons.
    const byId = new Map(r.steps.at(-1)!.cells.map(c => [c.id, c]));
    const wall = r.borders[0] ? close(r.borders[0].points) : [];
    const urban = new Set(r.steps[3].cells.filter(c => c.tag === "urban").map(c => c.id));
    const cs = r.params.cellSizeMeters;

    const wallBuildings = r.buildings.filter(b => {
      const cell = byId.get(b.cellId);
      return cell && urban.has(cell.id) && cell.polygon.some(p => nearestOnPolyline(p, wall).dist < cs * 0.2);
    });
    expect(wallBuildings.length).toBeGreaterThan(0);
    const wallGap = Math.min(...wallBuildings.flatMap(b => b.polygon.map(p => nearestOnPolyline(p, wall).dist)));
    expect(wallGap).toBeGreaterThan(MAIN_STREET / 2 - 1.5);

    const inner = r.buildings.filter(b => {
      const cell = byId.get(b.cellId);
      if (!cell || !urban.has(cell.id)) return false;
      return cell.polygon.every(p => nearestOnPolyline(p, wall).dist > cs * 0.6);
    });
    expect(inner.length).toBeGreaterThan(0);
    const innerGap = Math.min(
      ...inner.slice(0, 20).flatMap(b => {
        const cell = byId.get(b.cellId)!;
        const ring = close(cell.polygon);
        return b.polygon.map(p => nearestOnPolyline(p, ring).dist);
      })
    );
    expect(innerGap).toBeGreaterThan(REGULAR_STREET / 2 - 1.5);

    const farm = r.buildings.filter(b => b.ward === "farm");
    if (farm.length) {
      const farmGap = Math.min(
        ...farm.slice(0, 10).flatMap(b => {
          const cell = byId.get(b.cellId)!;
          return b.polygon.map(p => nearestOnPolyline(p, close(cell.polygon)).dist);
        })
      );
      expect(farmGap).toBeGreaterThan(ALLEY / 2 - 1.5);
    }
  });

  it("keeps plaza buildings to a statue-scale void, not a filled block", () => {
    const r = run("s7-plaza");
    const plaza = r.precincts.find(p => p.kind === "plaza");
    expect(plaza).toBeTruthy();
    const plazaBuildings = r.buildings.filter(b => plaza!.cellIds.includes(b.cellId));
    expect(plazaBuildings.length).toBeGreaterThanOrEqual(1);
    expect(plazaBuildings.length).toBeLessThanOrEqual(plaza!.cellIds.length);
    const cell = r.steps.at(-1)!.cells.find(c => c.id === plaza!.cellIds[0])!;
    const cellArea = Math.abs(polygonArea(cell.polygon));
    const built = plazaBuildings.reduce((s, b) => s + Math.abs(polygonArea(b.polygon)), 0);
    expect(built).toBeLessThan(cellArea * 0.25);
  });

  it("places every building inside its cell", () => {
    const r = run("s7-inside");
    const byId = new Map(r.steps.at(-1)!.cells.map(c => [c.id, c]));
    expect(r.buildings.length).toBeGreaterThan(20);
    let inside = 0;
    for (const b of r.buildings) {
      const cell = byId.get(b.cellId);
      if (!cell) continue;
      const c = b.polygon.reduce<Point>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
      const n = b.polygon.length || 1;
      if (pointInPolygon([c[0] / n, c[1] / n], cell.polygon)) inside++;
    }
    expect(inside / r.buildings.length).toBeGreaterThan(0.9);
  });

  it("exposes S7 as the last drawing-process step with building footprints", () => {
    const r = run("s7-step");
    expect(r.steps).toHaveLength(8);
    expect(r.steps.at(-1)?.label).toBe("S7 · Lots");
    expect(r.steps.at(-1)?.buildings.length).toBe(r.buildings.length);
    expect(r.steps[6]?.buildings).toHaveLength(0);
    expect(r.buildings.some(b => b.ward === "castle")).toBe(true);
    expect(r.buildings.some(b => b.ward === "craftsmen")).toBe(true);
  });
});

describe("no building sits out over the water (towngen-comparison.md §2.5 / §3.D.3)", () => {
  function runCoastal(seed: string, coast: "straight" | "bay" | "cape") {
    const config = {
      ...DEFAULT_SITE_CONFIG,
      coast,
      rivers: [] as const,
      relief: false,
      features: { ...DEFAULT_SITE_CONFIG.features, walls: true, plaza: true, citadel: false, port: true }
    };
    const site = synthSite("smallCity", config, seed);
    return generateCity(siteToParams(site), siteToGeography(site), siteToProgram(site));
  }

  it("no building polygon's centroid falls inside the water polygon", () => {
    let checked = 0;
    for (const coast of ["straight", "bay", "cape"] as const) {
      for (const seed of ["s7-water-a", "s7-water-b", "s7-water-c", "s7-water-d"]) {
        const r = runCoastal(seed, coast);
        if (!r.waterPolygon || r.waterPolygon.length < 3 || !r.buildings.length) continue;
        checked += r.buildings.length;
        for (const b of r.buildings) {
          const c = b.polygon.reduce<Point>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
          const centroid: Point = [c[0] / b.polygon.length, c[1] / b.polygon.length];
          expect(pointInPolygon(centroid, r.waterPolygon), `${coast}/${seed} building over water`).toBe(false);
        }
      }
    }
    expect(checked, "no coastal scenario produced any building to check").toBeGreaterThan(0);
  });
});
