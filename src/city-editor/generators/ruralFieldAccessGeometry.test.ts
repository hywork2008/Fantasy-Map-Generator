import { describe, expect, it } from "vitest";
import type { Point } from "../types/document";
import { isSimplePolygon, polygonArea } from "./geom";
import { intersectConvex } from "./parcelGeometry";
import { clipRuralAccess } from "./ruralFieldAccessGeometry";

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h]
];
const area = (p: Point[]) => Math.abs(polygonArea(p));
const cells = (skip: (x: number, y: number) => boolean = () => false) => {
  const nodes = new Map<string, { x: number; y: number }>();
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (!skip(x, y)) nodes.set(`${x}:${y}`, { x, y });
  return nodes;
};

describe("rural access clipping", () => {
  it("uses the full diagonal envelope without leaving cell-sized path margins", () => {
    const envelope: Point[] = [
      [1.3, 24.7],
      [75.3, 3.2],
      [97.8, 73.1],
      [18.4, 95.2]
    ];
    for (const q of [10, 20]) {
      const rings = clipRuralAccess(envelope, cells(), q);
      expect(rings).toHaveLength(1);
      expect(rings[0]).toHaveLength(4);
      expect(area(rings[0])).toBeCloseTo(area(envelope), 6);
    }
  });
  it("retains both disconnected sides without closing a polygon across the gap", () => {
    const rings = clipRuralAccess(
      rect(0, 0, 100, 100),
      cells(x => x === 4),
      10
    );
    expect(rings).toHaveLength(2);
    expect(rings.reduce((sum, ring) => sum + area(ring), 0)).toBeCloseTo(9000, 6);
    for (const ring of rings) expect(area(intersectConvex(ring, rect(40, 0, 10, 100)))).toBeLessThan(0.001);
  });
  it("splits around an inaccessible hole without losing the surrounding usable area", () => {
    const rings = clipRuralAccess(
      rect(0, 0, 100, 100),
      cells((x, y) => x >= 4 && x < 6 && y >= 4 && y < 6),
      10
    );
    expect(rings.length).toBeGreaterThan(1);
    expect(rings.reduce((sum, ring) => sum + area(ring), 0)).toBeCloseTo(9600, 6);
    for (const ring of rings) {
      expect(isSimplePolygon(ring, 150)).toBe(true);
      expect(area(intersectConvex(ring, rect(40, 40, 20, 20)))).toBeLessThan(0.001);
    }
  });
  it("replaces a stair-stepped margin with a checked diagonal while retaining envelope contacts", () => {
    const envelope = rect(0, 0, 100, 100);
    const reachable = cells((x, y) => y <= x);
    const raw = clipRuralAccess(envelope, reachable, 10);
    const smoothed = clipRuralAccess(envelope, reachable, 10, p => p.every(([x, y]) => y >= x - 1e-6));
    expect(raw[0].length).toBeGreaterThan(10);
    expect(smoothed).toHaveLength(1);
    expect(smoothed[0]).toHaveLength(3);
    expect(area(smoothed[0])).toBeCloseTo(4050, 6);
    expect(smoothed[0]).toContainEqual([0, 10]);
    expect(smoothed[0]).toContainEqual([90, 100]);
  });
  it("subdivides a diagonal shortcut where it would cross a real reservation", () => {
    const obstacle = rect(40, 50, 10, 10);
    const envelope = rect(0, 0, 100, 100);
    const reachable = cells((x, y) => y <= x || (x === 4 && y === 5));
    const rings = clipRuralAccess(
      envelope,
      reachable,
      10,
      p => p.every(([x, y]) => y >= x - 1e-6) && area(intersectConvex(p, obstacle)) < 0.001
    );
    expect(rings).toHaveLength(1);
    expect(rings[0].length).toBeGreaterThan(3);
    expect(isSimplePolygon(rings[0], 150)).toBe(true);
    expect(area(intersectConvex(rings[0], obstacle))).toBeLessThan(0.001);
  });
});
