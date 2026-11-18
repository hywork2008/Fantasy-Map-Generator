import { describe, expect, it } from "vitest";
import type { BurgageCellPlan } from "../../types/contracts/burgage";
import type { Point } from "../../types/geometry";
import { nearestOnPolyline, pointInPolygon, polygonArea } from "../geom";
import { planBinaireCell } from "./binaireCell";
import { LANE_CLEARANCE_METERS } from "./frame";
import { burgagePerimeterCell } from "./perimeterCell";
import { BURGAGE_PROFILES, burgageProfileFor } from "./profiles";
import { planBurgageCell } from "./stripCell";

const rect = (w: number, h: number, x = 0, y = 0): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h]
];
const ringEdges = (ring: Point[]) => ring.map((p, i) => [p, ring[(i + 1) % ring.length]] as Point[]);
const onRing = (p: Point, ring: Point[]) =>
  ringEdges(ring).some(edge => nearestOnPolyline(p, edge).dist < 1e-6) || pointInPolygon(p, ring);

/** No sample point lies strictly inside two plots. */
function overlapping(plan: BurgageCellPlan, ring: Point[]): number {
  const xs = ring.map(p => p[0]),
    ys = ring.map(p => p[1]);
  let hits = 0;
  for (let x = Math.min(...xs) + 0.13; x < Math.max(...xs); x += 0.5)
    for (let y = Math.min(...ys) + 0.17; y < Math.max(...ys); y += 0.5) {
      const inside = plan.plots.filter(
        p => pointInPolygon([x, y], p.ring) && ringEdges(p.ring).every(e => nearestOnPolyline([x, y], e).dist > 1e-3)
      );
      if (inside.length > 1) hits++;
    }
  return hits;
}

/** Every plot's front lies on the block's edge or on the side of one of its lanes. */
function frontsOnStreetOrLane(plan: BurgageCellPlan, ring: Point[]): boolean {
  return plan.plots.every(plot => {
    const mid: Point = [(plot.front[0][0] + plot.front[1][0]) / 2, (plot.front[0][1] + plot.front[1][1]) / 2];
    return (
      ringEdges(ring).some(edge => nearestOnPolyline(mid, edge).dist < 1e-6) ||
      // Plots keep a few centimetres off the lane's surface.
      plan.lanes.some(
        l => Math.abs(nearestOnPolyline(mid, l.points).dist - l.widthMeters / 2 - LANE_CLEARANCE_METERS) < 1e-6
      )
    );
  });
}

describe("burgage plot profiles", () => {
  it("picks the plot type of a housing culture", () => {
    expect(burgageProfileFor("northern-urban")).toBe("hofstatt");
    expect(burgageProfileFor("mediterranean")).toBe("binaire");
    expect(burgageProfileFor("atlantic")).toBe("english-burgage");
    expect(burgageProfileFor(undefined)).toBe("english-burgage");
  });
});

describe("strip plot cells", () => {
  const english = BURGAGE_PROFILES["english-burgage"],
    hofstatt = BURGAGE_PROFILES.hofstatt;

  it("lays two rows back to back between two streets, every plot narrow, deep and fronting its street", () => {
    const ring = rect(110, 80);
    const plan = planBurgageCell(ring, hofstatt, { seed: "a", fronts: [0, 2], setting: "intramural" });
    expect(plan.plots.length).toBeGreaterThan(10);
    expect(new Set(plan.plots.map(p => p.id.split(".")[0])).size).toBe(2);
    expect(frontsOnStreetOrLane(plan, ring)).toBe(true);
    expect(overlapping(plan, ring)).toBe(0);
    for (const plot of plan.plots) {
      expect(plot.ring.every(p => onRing(p, ring))).toBe(true);
      // Freiburg's widest and shallowest measured plot is 18 x 32 m.
      expect(plot.depthMeters).toBeGreaterThanOrEqual(plot.frontageMeters * 1.75);
      expect(plot.depthMeters).toBeCloseTo(40, 6);
    }
  });

  it("divides original plots in two so that the halves make up the original frontage", () => {
    const plan = planBurgageCell(rect(110, 80), english, { seed: "b", fronts: [0, 2], setting: "intramural" });
    const byParent = Map.groupBy(plan.plots, p => p.parent);
    const divided = [...byParent.values()].filter(group => group.length === 2);
    expect(divided.length).toBeGreaterThan(3);
    for (const [a, b] of divided) {
      expect(a.undivided || b.undivided).toBe(false);
      expect(a.frontageMeters + b.frontageMeters).toBeGreaterThanOrEqual(2 * english.frontageMeters[0] * 0.85);
      expect(a.frontageMeters + b.frontageMeters).toBeLessThanOrEqual(2 * english.frontageMeters[1] * 1.15);
    }
    for (const plot of plan.plots.filter(p => !p.undivided)) {
      expect(plot.frontageMeters).toBeGreaterThanOrEqual(english.frontageMeters[0] * 0.85);
      expect(plot.frontageMeters).toBeLessThanOrEqual(english.frontageMeters[1] * 1.15);
      expect(plot.depthMeters).toBeGreaterThanOrEqual(plot.frontageMeters * 2);
    }
  });

  it("backs a single row onto a back lane when only one side is a street", () => {
    const ring = rect(90, 48);
    const plan = planBurgageCell(ring, english, { seed: "c", fronts: [0], setting: "intramural" });
    const back = plan.lanes.filter(l => l.kind === "back");
    expect(back).toHaveLength(1);
    for (const plot of plan.plots)
      expect(plot.depthMeters + back[0].widthMeters + 2 * LANE_CLEARANCE_METERS).toBeLessThanOrEqual(48 + 1e-6);
    expect(frontsOnStreetOrLane(plan, ring)).toBe(true);
  });

  it("breaks a long block with cross lanes the plots keep clear of", () => {
    const ring = rect(300, 80);
    const plan = planBurgageCell(ring, hofstatt, { seed: "d", fronts: [0, 2], setting: "intramural" });
    const cross = plan.lanes.filter(l => l.kind === "cross");
    expect(cross.length).toBeGreaterThanOrEqual(2);
    for (const lane of cross)
      for (const plot of plan.plots)
        for (const p of plot.ring)
          expect(nearestOnPolyline(p, lane.points).dist).toBeGreaterThanOrEqual(lane.widthMeters / 2 - 1e-6);
    expect(overlapping(plan, ring)).toBe(0);
  });

  it("leaves the backland open when the block is deeper than two rows", () => {
    const ring = rect(100, 140);
    const plan = planBurgageCell(ring, english, { seed: "e", fronts: [0, 2], setting: "intramural" });
    const area = (r: Point[]) => Math.abs(polygonArea(r));
    expect(plan.open.length).toBeGreaterThan(0);
    const total = [...plan.plots.map(p => p.ring), ...plan.open].reduce((n, r) => n + area(r), 0);
    expect(total).toBeCloseTo(area(ring), 3);
  });

  it("keeps plots inside an oblique block and on its street", () => {
    const ring: Point[] = [
      [0, 0],
      [120, 0],
      [105, 70],
      [10, 82]
    ];
    const plan = planBurgageCell(ring, english, { seed: "f", fronts: [0, 2], setting: "intramural" });
    expect(plan.plots.length).toBeGreaterThan(8);
    expect(frontsOnStreetOrLane(plan, ring)).toBe(true);
    expect(overlapping(plan, ring)).toBe(0);
    for (const plot of plan.plots) expect(plot.ring.every(p => onRing(p, ring))).toBe(true);
  });

  it("gives the same plan for the same seed and another for another seed", () => {
    const at = (seed: string) =>
      planBurgageCell(rect(110, 80), english, { seed, fronts: [0, 2], setting: "intramural" });
    expect(at("g")).toEqual(at("g"));
    expect(at("g")).not.toEqual(at("h"));
  });
});

describe("binaire cells", () => {
  const binaire = BURGAGE_PROFILES.binaire;

  it("lays narrow blocks split by a venelle, head houses on the main street and houses on the cross lanes", () => {
    const ring = rect(100, 60);
    const plan = planBinaireCell(ring, binaire, { seed: "a", fronts: [0] });
    expect(plan.open).toHaveLength(0);
    expect(plan.lanes.filter(l => l.kind === "venelle").length).toBeGreaterThanOrEqual(5);
    expect(plan.lanes.filter(l => l.kind === "cross").length).toBeGreaterThanOrEqual(4);
    expect(frontsOnStreetOrLane(plan, ring)).toBe(true);
    expect(overlapping(plan, ring)).toBe(0);
    const heads = plan.plots.filter(p => p.kind === "head"),
      rows = plan.plots.filter(p => p.kind === "row");
    expect(heads.length).toBe(2 * plan.lanes.filter(l => l.kind === "venelle").length);
    for (const head of heads) {
      expect(head.front.every(p => Math.abs(p[1]) < 1e-6)).toBe(true);
      expect(head.depthMeters).toBeGreaterThanOrEqual(binaire.head.depthMeters[0] - 1e-6);
      expect(head.depthMeters).toBeLessThanOrEqual(binaire.head.depthMeters[1] + 1e-6);
    }
    for (const row of rows) {
      expect(row.frontageMeters).toBeGreaterThanOrEqual(binaire.house.frontageMeters[0] * 0.85);
      expect(row.frontageMeters).toBeLessThanOrEqual(binaire.house.frontageMeters[1] * 1.15);
      // Half a block, less half the venelle.
      expect(row.depthMeters).toBeGreaterThanOrEqual((binaire.blockWidthMeters[0] * 0.85 - binaire.venelleMeters) / 2);
      expect(row.depthMeters).toBeLessThanOrEqual((binaire.blockWidthMeters[1] * 1.15 - binaire.venelleMeters) / 2);
    }
  });

  it("puts head houses at both ends between two main streets and cuts over-long blocks", () => {
    const ring = rect(60, 150);
    const plan = planBinaireCell(ring, binaire, { seed: "b", fronts: [0, 2] });
    expect(plan.lanes.filter(l => l.kind === "transverse").length).toBe(2);
    expect(plan.plots.some(p => p.kind === "head" && p.front.every(q => Math.abs(q[1] - 150) < 1e-6))).toBe(true);
    expect(frontsOnStreetOrLane(plan, ring)).toBe(true);
    expect(overlapping(plan, ring)).toBe(0);
  });
});

describe("burgage street blocks beside a gate road", () => {
  it("lays a band bent by the road near the gate as full-depth plots along the road, not long triangles", () => {
    // The approach band south of the west gate road of `e69w8s` (2026-11-19 report): the road edge bends near the
    // gate, and the outer lane follows a gentle curve sampled every few metres.
    const ring: Point[] = [
      [-506.8, -2.58],
      [-339.99, -10.38],
      [-337.12, -10.66],
      [-332.99, -11.29],
      [-298.83, -17.89],
      [-294.78, 3.05],
      [-296.58, 5.81],
      [-334.27, 13.1],
      [-505.69, 21.1]
    ];
    const plan = burgagePerimeterCell(
      { profile: "english-burgage", wallRings: [] },
      { id: "band", ring, boundaries: [] },
      "gate-band",
      2.4
    );
    expect(plan.plots.length).toBeGreaterThan(15);
    // Every plot reaches across the band, road to outer lane: the band is about 22 m deep less the setbacks.
    const depths = plan.plots.map(p => {
      const [a, b] = p.front,
        l = Math.hypot(b[0] - a[0], b[1] - a[1]),
        v: Point = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
      return Math.max(...p.ring.map(q => Math.abs((q[0] - a[0]) * v[0] + (q[1] - a[1]) * v[1])));
    });
    expect(Math.min(...depths)).toBeGreaterThan(15);
  });
});
