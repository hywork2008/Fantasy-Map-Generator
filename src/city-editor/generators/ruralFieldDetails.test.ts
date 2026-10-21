import { describe, expect, it } from "vitest";
import type { Point } from "../types/document";
import { isSimplePolygon, polygonArea } from "./geom";
import { convexInfillParts } from "./lotGeometry";
import { corridor, intersectConvex } from "./parcelGeometry";
import { type DetailedRuralFieldInput, planDetailedRuralFields } from "./ruralFieldDetails";
import { ruralFieldSystem, validRuralFieldSettings } from "./ruralFieldProfile";

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h]
];
const area = (p: Point[]) => Math.abs(polygonArea(p));
const input = (overrides: Partial<DetailedRuralFieldInput> = {}): DetailedRuralFieldInput => ({
  seed: "details",
  system: "open-field",
  land: [{ faceId: "land", polygon: rect(0, 0, 320, 240) }],
  roads: [
    {
      points: [
        [0, 0],
        [320, 0]
      ],
      widthMeters: 6
    }
  ],
  blocked: () => false,
  ...overrides
});
const overlap = (a: Point[], b: Point[]) =>
  convexInfillParts(a).reduce(
    (sum, p) => sum + convexInfillParts(b).reduce((s, q) => s + area(intersectConvex(p, q)), 0),
    0
  );

describe("detailed rural fields", () => {
  it("preserves crop rotation, area limits and reservation clearance", () => {
    const plan = planDetailedRuralFields(input({ areaBudgetM2: 30000 }));
    const next = planDetailedRuralFields(input({ areaBudgetM2: 30000, settings: { rotationYear: 1 } }));
    expect(plan.farms.length).toBeGreaterThan(5);
    expect(plan.farms.map(f => f.polygon)).toEqual(next.farms.map(f => f.polygon));
    expect(plan.farms.some((f, i) => f.cropState !== next.farms[i].cropState)).toBe(true);
    expect(plan.farms.some(f => f.cropState === "fallow")).toBe(true);
    expect(plan.diagnostics.cultivatedAreaM2).toBeLessThanOrEqual(30000.01);
    for (const [i, farm] of plan.farms.entries()) {
      expect(isSimplePolygon(farm.polygon, 150)).toBe(true);
      for (const other of plan.farms.slice(i + 1)) expect(overlap(farm.polygon, other.polygon)).toBeLessThan(0.02);
      for (const lane of plan.lanes)
        expect(overlap(farm.polygon, corridor(lane.points[0], lane.points[1], lane.widthMeters))).toBeLessThan(0.02);
    }
  });
  it("preserves complete holdings when the visible frame clips them, without a fence on the clipping edge", () => {
    const plan = planDetailedRuralFields(input({ system: "bocage", visibleFrame: rect(0, 0, 181.25, 240) }));
    const clipped = plan.farms.filter(f => f.clippedByFrame);
    expect(clipped.length).toBeGreaterThan(0);
    for (const farm of clipped) {
      expect(area(farm.holdingPolygon!)).toBeGreaterThan(area(farm.polygon));
      expect(farm.boundaryKind).toBe("hedge");
      expect(farm.boundaries?.some(line => line.every(p => Math.abs(p[0] - 181.25) < 1e-6))).toBe(false);
    }
  });
  it("does not cultivate isolated land or grow into a reserved hole", () => {
    const hole = rect(120, 48, 40, 96),
      barrier = rect(0, 184, 320, 8);
    const plan = planDetailedRuralFields(input({ blocked: p => [hole, barrier].some(q => overlap(p, q) > 0.001) }));
    expect(plan.farms.length).toBeGreaterThan(0);
    for (const farm of plan.farms) {
      expect(overlap(farm.polygon, hole)).toBeLessThan(0.01);
      expect(Math.max(...farm.polygon.map(p => p[1]))).toBeLessThanOrEqual(184);
    }
  });
  it("selects explicit and regional profiles and rejects invalid persisted controls", () => {
    expect(ruralFieldSystem("highMedieval", "anglo")).toBe("open-field");
    expect(ruralFieldSystem("ageOfExploration", "gallic")).toBe("bocage");
    expect(ruralFieldSystem("petroleumEra", "anglo")).toBe("mechanized");
    expect(ruralFieldSystem("petroleumEra", "anglo", { system: "bocage" })).toBe("bocage");
    expect(validRuralFieldSettings({ rotationYear: -1 })).toBe(false);
    expect(validRuralFieldSettings({ system: "invalid" })).toBe(false);
    expect(validRuralFieldSettings({ gardenRadiusMeters: Infinity })).toBe(false);
  });
  it("reports unsuitable land and a zero budget without adopting farms", () => {
    const empty = planDetailedRuralFields(input({ land: [], areaBudgetM2: 1000, unsuitableAreaM2: 10000 }));
    expect(empty.diagnostics.shortfallReason).toBe("terrain");
    expect(planDetailedRuralFields(input({ areaBudgetM2: 0 })).farms).toEqual([]);
  });
});
