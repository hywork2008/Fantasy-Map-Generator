import { describe, expect, it } from "vitest";
import type { Point } from "../types/document";
import { polygonArea, polygonCentroid } from "./geom";
import { bounds, corridor, intersectConvex } from "./parcelGeometry";
import { planRuralFields, type RuralFieldInput } from "./ruralFieldPlan";

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h]
];
const area = (polygon: Point[]) => Math.abs(polygonArea(polygon));
const input = (overrides: Partial<RuralFieldInput> = {}): RuralFieldInput => ({
  seed: "countryside",
  land: [{ faceId: "whole", polygon: rect(0, 0, 480, 400) }],
  roads: [
    {
      points: [
        [0, 0],
        [480, 0]
      ],
      widthMeters: 6
    }
  ],
  blocked: () => false,
  ...overrides
});

describe("rural field planning", () => {
  it("lays the same rectangular fields across different cell diagonals", () => {
    const whole = planRuralFields(input());
    const triangles = planRuralFields(
      input({
        land: [
          {
            faceId: "a",
            polygon: [
              [0, 0],
              [480, 0],
              [480, 400]
            ]
          },
          {
            faceId: "b",
            polygon: [
              [0, 0],
              [480, 400],
              [0, 400]
            ]
          }
        ]
      })
    );
    expect(whole.farms.length).toBeGreaterThan(10);
    expect(triangles.farms.map(farm => farm.polygon)).toEqual(whole.farms.map(farm => farm.polygon));
    expect(triangles.lanes.map(lane => lane.points)).toEqual(whole.lanes.map(lane => lane.points));
    expect(triangles.farms.some(farm => farm.sourceFaceIds?.length === 2)).toBe(true);
    for (const farm of whole.farms) expect(farm.polygon).toHaveLength(4);
    expect(whole.farms.some(farm => polygonCentroid(farm.polygon)[1] > 200)).toBe(true);
  });

  it("connects every adopted plot through headlands and tracks to the road", () => {
    const plan = planRuralFields(input({ areaBudgetM2: 60_000 }));
    const signature = (p: Point) => p.join(":");
    const graph = new Map<string, Set<string>>();
    for (const lane of plan.lanes) {
      const a = signature(lane.points[0]),
        b = signature(lane.points[1]);
      graph.set(a, new Set([...(graph.get(a) ?? []), b]));
      graph.set(b, new Set([...(graph.get(b) ?? []), a]));
    }
    const queue = [...graph.keys()].filter(id => Number(id.split(":")[1]) === 0);
    const reached = new Set(queue);
    for (let i = 0; i < queue.length; i++)
      for (const next of graph.get(queue[i]) ?? []) {
        if (reached.has(next)) continue;
        reached.add(next);
        queue.push(next);
      }
    const headlands = plan.lanes.filter(lane => lane.kind === "headland");
    expect(headlands).toHaveLength(plan.farms.length);
    for (const lane of headlands) expect(reached.has(signature(lane.points[0]))).toBe(true);
    for (const farm of plan.farms)
      for (const lane of plan.lanes) {
        const band = corridor(lane.points[0], lane.points[1], lane.widthMeters);
        expect(area(intersectConvex(farm.polygon, band))).toBeLessThan(0.01);
      }
  });

  it("respects holes and cannot reach isolated land across water", () => {
    const hole = rect(160, 80, 64, 160);
    const water = rect(0, 280, 480, 16);
    const blocked = (polygon: Point[]) =>
      [hole, water].some(reserved => area(intersectConvex(polygon, reserved)) > 0.001);
    const plan = planRuralFields(input({ blocked }));
    expect(plan.farms.length).toBeGreaterThan(0);
    expect(plan.farms.every(farm => bounds(farm.polygon)[3] <= 280)).toBe(true);
    for (const farm of plan.farms) expect(blocked(farm.polygon)).toBe(false);
    for (const lane of plan.lanes)
      expect(blocked(corridor(lane.points[0], lane.points[1], lane.widthMeters))).toBe(false);
  });

  it("rotates the survey with the physical road while keeping reservations clear", () => {
    const angle = Math.PI / 6;
    const rotate = ([x, y]: Point): Point => [
      x * Math.cos(angle) - y * Math.sin(angle),
      x * Math.sin(angle) + y * Math.cos(angle)
    ];
    const hole = rect(160, 80, 64, 160).map(rotate);
    const base = input();
    const plan = planRuralFields({
      ...base,
      land: base.land.map(face => ({ ...face, polygon: face.polygon.map(rotate) })),
      roads: base.roads.map(road => ({ ...road, points: road.points.map(rotate) })),
      blocked: polygon => area(intersectConvex(polygon, hole)) > 0.001
    });
    expect(plan.diagnostics.orientationRadians).toBeCloseTo(angle);
    expect(plan.farms.length).toBeGreaterThan(0);
    for (const farm of plan.farms) {
      expect(area(intersectConvex(farm.polygon, hole))).toBeLessThan(0.01);
      const [a, b] = farm.rows[0];
      expect(Math.atan2(b[1] - a[1], b[0] - a[0])).toBeCloseTo(angle);
    }
  });

  it("fits the last field to the remaining area and reports small or unreachable budgets", () => {
    const plan = planRuralFields(input({ areaBudgetM2: 12_345 }));
    expect(plan.diagnostics.cultivatedAreaM2).toBeLessThanOrEqual(12_345 + 1e-6);
    expect(plan.diagnostics.shortfallAreaM2).toBeLessThan(750);
    expect(planRuralFields(input({ areaBudgetM2: 0 })).farms).toEqual([]);
    const tiny = planRuralFields(input({ areaBudgetM2: 20 }));
    expect(tiny.diagnostics.shortfallAreaM2).toBe(20);
    const isolated = planRuralFields(input({ roads: [], areaBudgetM2: 1000 }));
    expect(isolated.farms).toEqual([]);
    expect(isolated.diagnostics.shortfallAreaM2).toBe(1000);
    expect(planRuralFields(input({ areaBudgetM2: Number.NaN })).farms).toEqual([]);
  });

  it("gives mechanized fields longer runs and wider access than medieval fields", () => {
    const medieval = planRuralFields(input({ period: "highMedieval" }));
    const modern = planRuralFields(input({ period: "rocketryEra" }));
    expect(modern.farms.length).toBeGreaterThan(0);
    const longest = (plan: typeof modern) =>
      Math.max(...plan.farms.map(farm => bounds(farm.polygon)[2] - bounds(farm.polygon)[0]));
    expect(longest(modern)).toBeGreaterThan(longest(medieval));
    expect(modern.lanes.some(lane => lane.kind === "farm-track" && lane.widthMeters === 4)).toBe(true);
    expect(planRuralFields(input())).toEqual(planRuralFields(input()));
  });
});
