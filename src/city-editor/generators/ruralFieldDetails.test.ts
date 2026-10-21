import { describe, expect, it } from "vitest";
import type { Point } from "../types/document";
import { isSimplePolygon, polygonArea } from "./geom";
import { convexInfillParts } from "./lotGeometry";
import { corridor, intersectConvex } from "./parcelGeometry";
import { type DetailedRuralFieldInput, planDetailedRuralFields } from "./ruralFieldDetails";
import { ruralFieldSystem, validRuralFieldSettings } from "./ruralFieldProfile";
import { riverRibbonRing } from "./townWater";

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
  it("keeps footpaths narrow independently of the access search resolution", () => {
    for (const targetAccessCells of [1000, 25000]) {
      const plan = planDetailedRuralFields(input({ settings: { targetAccessCells } }));
      expect(plan.farms.length).toBeGreaterThan(5);
      expect(plan.lanes.length).toBeGreaterThan(0);
      expect(plan.lanes.every(lane => lane.points.length === 2 && lane.widthMeters === 1.2)).toBe(true);
      for (const farm of plan.farms)
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
  it("plans both banks independently even when dry land connects around the river endpoints", () => {
    const river = corridor([160, 40], [160, 200], 8);
    const plan = planDetailedRuralFields(
      input({
        riverDividers: [
          [
            [160, 40],
            [160, 200]
          ]
        ],
        blocked: polygon => overlap(polygon, river) > 0.001
      })
    );
    const left = plan.farms.filter(f => f.polygon.every(p => p[0] <= 160));
    const right = plan.farms.filter(f => f.polygon.every(p => p[0] >= 160));
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    expect(left.length + right.length).toBe(plan.farms.length);
    const leftGroups = new Set(left.map(f => f.managementGroupId));
    expect(right.every(f => !leftGroups.has(f.managementGroupId))).toBe(true);
    expect(new Set([...left, ...right].map(f => f.orientationRadians)).size).toBeGreaterThan(1);
    for (const farm of plan.farms) expect(overlap(farm.polygon, river)).toBeLessThan(0.01);
  });

  it("terminates independently oriented parcels at both banks of a bending river", () => {
    const line: Point[] = [
      [120, 0],
      [120, 80],
      [180, 160],
      [180, 240]
    ];
    const river = riverRibbonRing(line, 8)!;
    const plan = planDetailedRuralFields(
      input({ riverDividers: [line], blocked: polygon => overlap(polygon, river) > 0.001 })
    );
    const riverX = (y: number) => (y < 80 ? 120 : y > 160 ? 180 : 120 + (y - 80) * 0.75);
    const left = plan.farms.filter(f => f.polygon.every(([x, y]) => x < riverX(y)));
    const right = plan.farms.filter(f => f.polygon.every(([x, y]) => x > riverX(y)));
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    expect(left.length + right.length).toBe(plan.farms.length);
    expect(right.every(f => !left.some(other => other.managementGroupId === f.managementGroupId))).toBe(true);
    for (const farm of plan.farms) expect(overlap(farm.polygon, river)).toBeLessThan(0.01);
  });

  it("restarts mechanized headland spacing independently on the opposite bank", () => {
    const river = corridor([320, 40], [320, 440], 8);
    const plan = planDetailedRuralFields(
      input({
        system: "mechanized",
        period: "petroleumEra",
        land: [{ faceId: "land", polygon: rect(0, 0, 640, 480) }],
        roads: [
          {
            points: [
              [0, 0],
              [640, 0]
            ],
            widthMeters: 6
          }
        ],
        riverDividers: [
          [
            [320, 40],
            [320, 440]
          ]
        ],
        blocked: polygon => overlap(polygon, river) > 0.001
      })
    );
    const left = plan.farms.filter(f => f.polygon.every(p => p[0] < 320));
    const right = plan.farms.filter(f => f.polygon.every(p => p[0] > 320));
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    expect(left.length + right.length).toBe(plan.farms.length);
    expect(right.every(f => !left.some(other => other.managementGroupId === f.managementGroupId))).toBe(true);
    const phases = (farms: typeof left) =>
      new Set(farms.map(f => Math.round(Math.min(...f.polygon.map(p => p[1]))) % 72));
    expect([...phases(right)].every(phase => !phases(left).has(phase))).toBe(true);
  });

  it("selects explicit and regional profiles and rejects invalid persisted controls", () => {
    expect(ruralFieldSystem("highMedieval", "anglo")).toBe("open-field");
    expect(ruralFieldSystem("ageOfExploration", "gallic")).toBe("bocage");
    expect(ruralFieldSystem("petroleumEra", "anglo")).toBe("mechanized");
    expect(ruralFieldSystem("petroleumEra", "anglo", { system: "bocage" })).toBe("bocage");
    expect(validRuralFieldSettings({ targetAccessCells: 25000 })).toBe(true);
    for (const targetAccessCells of [0, -1, 25000.5, Infinity, 1_000_001])
      expect(validRuralFieldSettings({ targetAccessCells })).toBe(false);
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
