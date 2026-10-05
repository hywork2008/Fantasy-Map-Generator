import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { polygonArea, rectangle } from "./landUseGeometry";
import { buildParcels, quantizeSpacing, shrinkPiecesToArea } from "./organicParcels";

const isConvex = (poly: Point[]) => {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      c = poly[(i + 2) % poly.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
};

describe("organic field parcels", () => {
  it("tiles the boundary exactly with convex, irregular parcels", () => {
    const boundary = rectangle(0, 0, 60, 45);
    const parcels = buildParcels({ boundary, spacing: 4, angle: 0.4 });
    const total = parcels.reduce((s, p) => s + p.pieces.reduce((t, piece) => t + polygonArea(piece), 0), 0);
    expect(total).toBeCloseTo(polygonArea(boundary), 6);
    expect(new Set(parcels.map(p => p.key)).size).toBe(parcels.length);
    for (const parcel of parcels) for (const piece of parcel.pieces) expect(isConvex(piece)).toBe(true);
    // Squares and triangles are what the old coarse tiles produced; interior parcels must not be those.
    const interior = parcels.filter(p => p.pieces[0].every(v => v[0] > 1 && v[0] < 59 && v[1] > 1 && v[1] < 44));
    expect(interior.length).toBeGreaterThan(20);
    expect(interior.filter(p => p.pieces[0].length >= 5).length).toBeGreaterThan(interior.length / 2);
    const areas = interior.map(p => polygonArea(p.pieces[0]));
    expect(Math.max(...areas) / Math.min(...areas)).toBeGreaterThan(1.5);
  });

  it("cuts the same parcels for overlapping windows so neighbouring cells line up", () => {
    const a = buildParcels({ boundary: rectangle(0, 0, 40, 40), spacing: 4, angle: 0 });
    const b = buildParcels({ boundary: rectangle(20, 10, 40, 40), spacing: 4, angle: 0 });
    const shared = a.filter(p => b.some(q => q.key === p.key));
    expect(shared.length).toBeGreaterThan(10);
    for (const p of shared) {
      const q = b.find(candidate => candidate.key === p.key)!;
      expect(q.center[0]).toBeCloseTo(p.center[0], 9);
      expect(q.center[1]).toBeCloseTo(p.center[1], 9);
    }
  });

  it("is deterministic and quantises spacing so similar cells share a lattice", () => {
    const first = buildParcels({ boundary: rectangle(0, 0, 30, 30), spacing: 3, angle: 1 });
    expect(JSON.stringify(buildParcels({ boundary: rectangle(0, 0, 30, 30), spacing: 3, angle: 1 }))).toBe(
      JSON.stringify(first)
    );
    expect(quantizeSpacing(3.0).level).toBe(quantizeSpacing(3.1).level);
  });

  it("shrinks pieces to an exact area without leaving the original", () => {
    const piece = rectangle(0, 0, 10, 10);
    const [shrunk] = shrinkPiecesToArea([piece], 25);
    expect(polygonArea(shrunk)).toBeCloseTo(25, 9);
    for (const p of shrunk) {
      expect(p[0]).toBeGreaterThanOrEqual(0);
      expect(p[0]).toBeLessThanOrEqual(10);
    }
  });
});
