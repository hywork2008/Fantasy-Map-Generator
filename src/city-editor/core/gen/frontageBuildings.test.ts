import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { type FrontageOptions, frontageBuildings } from "./frontageBuildings";
import { pointInPolygon, polygonArea, segmentSegmentHit } from "./geom";
import { convexInfillParts } from "./localInfill";
import { clipHalfPlane } from "./lotGeometry";
import { makeRng } from "./prng";

const options: FrontageOptions = { lotArea: 180, coverage: 0.75, occupancy: 1, outskirts: false };
const block: Point[] = [
  [0, 0],
  [160, 0],
  [160, 100],
  [0, 100]
];
const area = (p: Point[]) => Math.abs(polygonArea(p));
const generate = (polygon = block, edges = [0], changes: Partial<FrontageOptions> = {}) =>
  frontageBuildings(polygon, edges, { ...options, ...changes }, makeRng("frontage-regression"));
const front = (p: Point[]) => p.filter(p => Math.abs(p[1] - 0.15) < 1e-6).sort((a, b) => a[0] - b[0]);

function intersectionArea(a: Point[], b: Point[]): number {
  let result = a;
  const sign = -Math.sign(polygonArea(b));
  for (let i = 0; i < b.length; i++) {
    const p = b[i],
      q = b[(i + 1) % b.length];
    const n: Point = [sign * (q[1] - p[1]), sign * (p[0] - q[0])];
    result = clipHalfPlane(result, n, p[0] * n[0] + p[1] * n[1]);
  }
  return area(result);
}

describe("plain frontage buildings", () => {
  it("keeps the street front aligned, with narrow side gaps and a shared rear yard", () => {
    const buildings = generate();
    expect(buildings.length).toBeGreaterThan(10);
    const intervals = buildings
      .map(p => {
        const points = front(p);
        expect(points).toHaveLength(2);
        expect(Math.min(...p.map(p => p[1]))).toBeCloseTo(0.15, 6);
        expect(Math.max(...p.map(p => p[1]))).toBeLessThan(30);
        return [points[0][0], points[1][0]];
      })
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < intervals.length; i++) expect(intervals[i][0] - intervals[i - 1][1]).toBeCloseTo(0.16, 6);
    expect(buildings.reduce((sum, p) => sum + area(p), 0)).toBeGreaterThan(160 * 15);
  });

  it("changes coverage at the rear without moving the frontage or resampling occupied lots", () => {
    const full = generate(),
      sparse = generate(block, [0], { coverage: 0.5 });
    expect(sparse.map(front)).toEqual(full.map(front));
    expect(sparse.reduce((sum, p) => sum + area(p), 0)).toBeLessThan(full.reduce((sum, p) => sum + area(p), 0));
    const occupied = generate(block, [0], { occupancy: 0.6 });
    expect(occupied.length).toBeLessThan(full.length);
    for (const p of occupied) expect(full).toContainEqual(p);
    expect(generate()).toEqual(full);
  });

  it("follows rotated frontages in either winding", () => {
    const theta = 0.37,
      c = Math.cos(theta),
      s = Math.sin(theta);
    const rotate = ([x, y]: Point): Point => [x * c - y * s + 10, x * s + y * c - 20];
    for (const reversed of [false, true]) {
      const polygon = (reversed ? [...block].reverse() : block).map(rotate);
      const buildings = generate(polygon, [reversed ? 2 : 0]);
      expect(buildings.length).toBeGreaterThan(10);
      for (const building of buildings) {
        expect(building.every(p => pointInPolygon(p, polygon))).toBe(true);
        const distances = building.map(([x, y]) => -(x - 10) * s + (y + 20) * c);
        expect(Math.min(...distances)).toBeCloseTo(0.15, 6);
        expect(distances.filter(d => Math.abs(d - 0.15) < 1e-6)).toHaveLength(2);
      }
    }
  });

  it("allocates angled corners without overlapping rows or self-intersecting L/U footprints", () => {
    const polygon: Point[] = [
      [0, 0],
      [130, 0],
      [150, 80],
      [20, 110]
    ];
    const buildings = generate(polygon, [0, 1, 2, 3], { lotArea: 320 });
    expect(buildings.some(p => p.length >= 6)).toBe(true);
    expect(buildings.some(p => p.length >= 8)).toBe(true);
    const pieces = buildings.map(p => {
      expect(p.every(v => pointInPolygon(v, polygon))).toBe(true);
      for (let i = 0; i < p.length; i++)
        for (let j = i + 2; j < p.length; j++) {
          if (i === 0 && j === p.length - 1) continue;
          expect(segmentSegmentHit(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length])).toBeNull();
        }
      const parts = convexInfillParts(p);
      expect(parts.reduce((sum, part) => sum + area(part), 0)).toBeCloseTo(area(p), 5);
      return parts;
    });
    for (let i = 0; i < pieces.length; i++)
      for (let j = i + 1; j < pieces.length; j++)
        for (const a of pieces[i]) for (const b of pieces[j]) expect(intersectionArea(a, b)).toBeLessThan(1e-6);
  });
});
