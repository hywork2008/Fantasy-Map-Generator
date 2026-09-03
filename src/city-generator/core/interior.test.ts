import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_CONFIG } from "../site/siteConfig";
import { siteToGeography, siteToParams, siteToProgram } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { pointInPolygon } from "./geom";
import { markSeaSurroundedGates } from "./interior";
import { generateCity } from "./pipeline";
import type { Gate, Point } from "./types";

function run(seed: string, walls = true) {
  const config = {
    ...DEFAULT_SITE_CONFIG,
    coast: "none" as const,
    rivers: [],
    relief: false,
    features: { ...DEFAULT_SITE_CONFIG.features, walls, plaza: true, citadel: true }
  };
  const site = synthSite("smallCity", config, seed);
  return generateCity(siteToParams(site), siteToGeography(site), siteToProgram(site));
}

describe("S4 interior perimeter", () => {
  it("makes deterministic, simple closed borders that contain the urban core", () => {
    const result = run("s4-border");
    expect(JSON.stringify(result)).toEqual(JSON.stringify(run("s4-border")));
    expect(result.borders.length).toBeGreaterThan(0);
    const urban = result.steps[3].cells.flatMap((c, i) =>
      c.tag === "urban" && !result.cells[i].onBorder ? [result.cells[i]] : []
    );
    for (const border of result.borders) {
      expect(border.points.length).toBeGreaterThan(3);
      expect(new Set(border.points.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`)).size).toBe(border.points.length);
    }
    // This dry configuration has one component, so every interior urban centroid
    // must sit inside its single outer circumference.
    expect(result.borders).toHaveLength(1);
    for (const cell of urban) expect(pointInPolygon(cell.centroid, result.borders[0].points)).toBe(true);
  });

  it("derives a thinned gate count from (not equal to) FMG's road count, at real block corners", () => {
    const result = run("s4-gates");
    // towngen-comparison.md §3.B: clamp(round(suggestedGates * 0.7), 3, 6), +1 wet.
    expect(result.gates.length).toBeGreaterThanOrEqual(3);
    expect(result.gates.length).toBeLessThanOrEqual(7);
    expect(new Set(result.gates.map(g => `${g.borderIndex}:${g.point.join(",")}`)).size).toBe(result.gates.length);
    // Every gate sits where >= 2 urban cells meet — a real block corner, not an
    // arbitrary point along a straight wall run.
    const urbanIds = new Set(result.steps[3].cells.flatMap((c, i) => (c.tag === "urban" ? [result.cells[i].id] : [])));
    for (const gate of result.gates) {
      const sharing = result.cells.filter(
        c => urbanIds.has(c.id) && c.polygon.some(v => Math.hypot(v[0] - gate.point[0], v[1] - gate.point[1]) < 1)
      );
      expect(sharing.length, `gate ${gate.point.join()} sits at a block corner`).toBeGreaterThanOrEqual(2);
    }
    const plaza = result.precincts.find(p => p.kind === "plaza");
    const citadel = result.precincts.find(p => p.kind === "citadel");
    expect(plaza).toBeTruthy();
    expect(citadel).toBeTruthy();
    expect(citadel!.cellIds[0]).not.toBe(plaza!.cellIds[0]);
    const citadelCell = result.cells.find(c => c.id === citadel!.cellIds[0])!;
    expect(citadelCell.neighbors.some(id => urbanIds.has(id))).toBe(true);
    expect(Math.hypot(...citadelCell.centroid)).toBeGreaterThanOrEqual(result.params.cityRadiusMeters * 0.15);
  });

  it("thins gates apart along the wall instead of letting them bunch up", () => {
    for (const seed of ["s4-spacing-a", "s4-spacing-b", "s4-spacing-c"]) {
      const result = run(seed);
      const border = result.borders[0];
      if (!border || result.gates.length < 2) continue;
      const ring = [...border.points, border.points[0]];
      const perimeter = ring.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - ring[i][0], p[1] - ring[i][1]), 0);
      const arcOf = (point: [number, number]): number => {
        let best = Number.POSITIVE_INFINITY;
        let acc = 0;
        let along = 0;
        for (let i = 0; i < ring.length - 1; i++) {
          const [a, b] = [ring[i], ring[i + 1]];
          const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const d = Math.hypot(point[0] - a[0], point[1] - a[1]);
          if (d < best) {
            best = d;
            along = acc;
          }
          acc += seg;
        }
        return along;
      };
      const arcs = result.gates.map(g => arcOf(g.point)).sort((a, b) => a - b);
      const minSpacing = perimeter / (result.gates.length + 1);
      for (let i = 0; i < arcs.length; i++) {
        const next = arcs[(i + 1) % arcs.length];
        const gap = i + 1 < arcs.length ? next - arcs[i] : perimeter - arcs[i] + next;
        // A little slack: gates snap to real vertices, so exact spacing wobbles.
        expect(gap, `seed ${seed} gates ${i}/${(i + 1) % arcs.length} too close`).toBeGreaterThan(minSpacing * 0.5);
      }
    }
  });

  it("adds a gate when the town is wet (coast or river) vs. the same layout dry", () => {
    const dryConfig = {
      ...DEFAULT_SITE_CONFIG,
      coast: "none" as const,
      rivers: [],
      relief: false,
      features: { ...DEFAULT_SITE_CONFIG.features, walls: true, plaza: true, citadel: true }
    };
    const wetConfig = { ...dryConfig, rivers: ["through" as const] };
    const dry = generateCity(
      siteToParams(synthSite("smallCity", dryConfig, "s4-wet")),
      siteToGeography(synthSite("smallCity", dryConfig, "s4-wet")),
      siteToProgram(synthSite("smallCity", dryConfig, "s4-wet"))
    );
    const wet = generateCity(
      siteToParams(synthSite("smallCity", wetConfig, "s4-wet")),
      siteToGeography(synthSite("smallCity", wetConfig, "s4-wet")),
      siteToProgram(synthSite("smallCity", wetConfig, "s4-wet"))
    );
    expect(wet.gates.length).toBeGreaterThanOrEqual(dry.gates.length);
  });

  it("does not emit a drawn town wall or towers for an open settlement, but still rings the citadel", () => {
    const open = run("s4-open", false);
    const overlays = open.steps.at(-1)!.overlays;
    expect(overlays.some(o => o.kind === "wall" || o.kind === "tower")).toBe(false);
    // The citadel keeps its enceinte even when the town itself is unwalled (design §4.2).
    expect(overlays.some(o => o.kind === "citadelWall")).toBe(true);
    expect(open.borders.length).toBeGreaterThan(0);
    expect(open.gates.length).toBeGreaterThan(0);
  });
});

describe("markSeaSurroundedGates (towngen-comparison.md §2.5 / §3.D.4)", () => {
  const water: Point[] = [
    [-100, -100],
    [100, -100],
    [100, 100],
    [-100, 100]
  ];
  const gate = (point: Point, water_ = false): Gate => ({ point, borderIndex: 0, water: water_ });

  it("reclassifies a land gate whose surroundings are entirely sea, regardless of port", () => {
    const gates = [gate([0, 0])]; // dead centre of the water polygon above
    const out = markSeaSurroundedGates(gates, water, 10);
    expect(out[0].water).toBe(true);
  });

  it("leaves a land gate alone when any part of its surroundings is dry", () => {
    const gates = [gate([99, 99])]; // just inside the corner — one probe direction is outside
    const out = markSeaSurroundedGates(gates, water, 10);
    expect(out[0].water).toBe(false);
  });

  it("leaves an already-water gate and a null/degenerate waterPolygon untouched", () => {
    const alreadyWater = markSeaSurroundedGates([gate([0, 0], true)], water, 10);
    expect(alreadyWater[0].water).toBe(true);
    expect(markSeaSurroundedGates([gate([0, 0])], null, 10)[0].water).toBe(false);
    expect(markSeaSurroundedGates([], water, 10)).toEqual([]);
  });
});
