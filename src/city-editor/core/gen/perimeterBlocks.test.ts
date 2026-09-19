import { describe, expect, it } from "vitest";
import type { DistrictParameters, Face, Point } from "../types";
import { frontageBuildings } from "./frontageBuildings";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid, segmentSegmentHit } from "./geom";
import { clipHalfPlane } from "./lotGeometry";
import { buildPerimeterBlocks, clipStreetBlocks, streetChords } from "./perimeterBlocks";
import { makeRng } from "./prng";

const area = (p: Point[]) => Math.abs(polygonArea(p));
const rect: Point[] = [
  [0, 0],
  [60, 0],
  [60, 50],
  [0, 50]
];
const parameters: DistrictParameters = { lotArea: 80, coverage: 0.9, occupancy: 1, laneWidth: 3, orientation: 0 };
const houses = (poly: Point[]) =>
  frontageBuildings(
    poly,
    poly.map((_, i) => i),
    { ...parameters, outskirts: false, perimeter: true },
    makeRng("perimeter-test")
  );
function overlap(a: Point[], b: Point[]): number {
  let result = a;
  const sign = -Math.sign(polygonArea(b));
  for (let i = 0; i < b.length; i++) {
    const p = b[i],
      q = b[(i + 1) % b.length];
    const normal: Point = [sign * (q[1] - p[1]), sign * (p[0] - q[0])];
    result = clipHalfPlane(result, normal, p[0] * normal[0] + p[1] * normal[1]);
  }
  return area(result);
}

describe("dense perimeter blocks", () => {
  it("keeps dense blocks without forcing all internal streets into a single orthogonal grid", () => {
    const outline: Point[] = [
      [0, 0],
      [320, 0],
      [320, 280],
      [0, 280]
    ];
    const face: Face = {
      id: "irregular",
      boundary: [],
      properties: { water: "land", ward: "craftsmen", buildable: true, settlement: "core", locked: false, elevation: 0 }
    };
    const boundaries = outline.map((a, i) => ({ a, b: outline[(i + 1) % outline.length], setback: 2, feature: true }));
    const fabric = buildPerimeterBlocks(face, outline, boundaries, parameters, "organic", true);
    // Fold 90-degree rotations together. A grid has a single bearing here,
    // even if the entire district has been rotated away from the map axes.
    const bearings = new Set(
      fabric.lanes.map(l => {
        const a = l.points[0],
          b = l.points[1];
        const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI * 2) % (Math.PI / 2);
        return Math.floor(angle / (Math.PI / 12));
      })
    );
    expect(bearings.size).toBeGreaterThan(3);
    // Merely rotating BSP cuts still leaves long through-streets and mostly
    // four-sided blocks. Independent Voronoi sites must give short links,
    // predominantly three-way junctions, and many five-/six-sided blocks.
    expect(fabric.blocks.filter(p => p.length >= 5).length / fabric.blocks.length).toBeGreaterThan(0.5);
    const junctions = new Map<string, Point[]>();
    for (const lane of fabric.lanes) {
      const [a, b] = lane.points;
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(160);
      for (const [p, q] of [
        [a, b],
        [b, a]
      ]) {
        const id = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;
        const directions = junctions.get(id) ?? [];
        const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
        directions.push([(q[0] - p[0]) / length, (q[1] - p[1]) / length]);
        junctions.set(id, directions);
      }
    }
    const internal = [...junctions.values()].filter(v => v.length > 1);
    expect(internal.length).toBeGreaterThan(10);
    expect(internal.every(v => v.length === 3)).toBe(true);
    expect(
      internal.filter(v => v.every((a, i) => v.slice(i + 1).every(b => a[0] * b[0] + a[1] * b[1] > -0.98))).length /
        internal.length
    ).toBeGreaterThan(0.8);
    for (let i = 0; i < fabric.blocks.length; i++)
      for (let j = i + 1; j < fabric.blocks.length; j++)
        expect(overlap(fabric.blocks[i], fabric.blocks[j])).toBeLessThan(1e-5);
    // Extra mesh vertices along the same outline cannot create new streets.
    const refined: Point[] = outline.flatMap((a, i) => {
      const b = outline[(i + 1) % outline.length];
      return [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point];
    });
    expect(buildPerimeterBlocks(face, refined, boundaries, parameters, "organic", true)).toEqual(fabric);
    const sizes = fabric.blocks.map(area);
    const mean = sizes.reduce((s, a) => s + a, 0) / sizes.length;
    const variation = Math.sqrt(sizes.reduce((s, a) => s + (a - mean) ** 2, 0) / sizes.length) / mean;
    expect(variation).toBeGreaterThan(0.2);
    expect(mean).toBeGreaterThan(700);
    expect(mean).toBeLessThan(2200);
    const houseMean = fabric.buildings.reduce((s, b) => s + area(b.polygon), 0) / Math.max(1, fabric.buildings.length);
    expect(houseMean).toBeGreaterThan(30);
    expect(houseMean).toBeLessThan(130);
    expect(fabric.buildings.reduce((s, b) => s + area(b.polygon), 0) / area(outline)).toBeGreaterThan(0.55);
    expect(buildPerimeterBlocks(face, outline, boundaries, parameters, "organic", true)).toEqual(fabric);
  });
  it("covers 90% of a block with non-overlapping rectangular houses facing all four streets", () => {
    const buildings = houses(rect);
    expect(buildings.reduce((sum, p) => sum + area(p), 0) / area(rect)).toBeCloseTo(0.9, 3);
    for (let i = 0; i < buildings.length; i++) {
      expect(buildings[i]).toHaveLength(4);
      for (let j = i + 1; j < buildings.length; j++) expect(overlap(buildings[i], buildings[j])).toBeLessThan(1e-5);
    }
    // Both the horizontal and the vertical rows must have their short ends
    // on the corresponding street; location counts alone cannot test this.
    for (let side = 0; side < 4; side++) {
      const a = rect[side],
        b = rect[(side + 1) % 4];
      const row = buildings.filter(p => p.filter(q => nearestOnPolyline(q, [a, b]).dist < 1e-3).length >= 2);
      expect(row.length).toBeGreaterThan(1);
      expect(
        row.some(p => {
          const ends = p.filter(q => nearestOnPolyline(q, [a, b]).dist < 1e-3);
          const frontage = Math.hypot(ends[0][0] - ends[1][0], ends[0][1] - ends[1][1]);
          const depth = Math.max(...p.map(q => nearestOnPolyline(q, [a, b]).dist));
          return depth > frontage * 1.3;
        })
      ).toBe(true);
    }
  });

  it("retains density, containment and non-overlap on rotated and oblique blocks of either winding", () => {
    const oblique: Point[] = [
      [0, 0],
      [70, 10],
      [60, 65],
      [-5, 48]
    ];
    for (const source of [rect, oblique])
      for (const reverse of [false, true]) {
        const poly = (reverse ? [...source].reverse() : source).map(
          ([x, y]): Point => [
            x * Math.cos(0.37) - y * Math.sin(0.37) + 113,
            x * Math.sin(0.37) + y * Math.cos(0.37) - 89
          ]
        );
        const buildings = houses(poly);
        expect(buildings.reduce((s, p) => s + area(p), 0) / area(poly)).toBeGreaterThan(0.82);
        for (let i = 0; i < buildings.length; i++) {
          expect(buildings[i].every(p => pointInPolygon(p, poly))).toBe(true);
          for (let j = i + 1; j < buildings.length; j++) expect(overlap(buildings[i], buildings[j])).toBeLessThan(1e-5);
        }
      }
  });

  const u: Point[] = [
    [0, 0],
    [180, 0],
    [180, 180],
    [120, 180],
    [120, 60],
    [60, 60],
    [60, 180],
    [0, 180]
  ];
  it("splits concave outlines into separate components without filling the notch or losing area", () => {
    for (const poly of [u, [...u].reverse()]) {
      const lower = clipStreetBlocks(poly, [0, 1], 100);
      const upper = clipStreetBlocks(poly, [0, -1], -100);
      expect(lower).toHaveLength(1);
      expect(upper).toHaveLength(2);
      expect([...lower, ...upper].reduce((sum, p) => sum + area(p), 0)).toBeCloseTo(area(poly), 6);
      expect(upper.every(p => !pointInPolygon([90, 120], p))).toBe(true);
      expect(streetChords(poly, [0, 1], 100)).toHaveLength(2);
      // Cuts exactly on an existing concave vertex must also conserve area.
      const atVertex = [...clipStreetBlocks(poly, [1, 0], 60), ...clipStreetBlocks(poly, [-1, 0], -60)];
      expect(atVertex.reduce((sum, p) => sum + area(p), 0)).toBeCloseTo(area(poly), 6);
    }
  });

  it("conserves area when streets pass through concave vertices in rotated districts", () => {
    for (const angle of [0, 0.37, 1.1]) {
      const c = Math.cos(angle),
        s = Math.sin(angle);
      const poly = u.map(([x, y]): Point => [x * c - y * s + 10, x * s + y * c - 30]);
      for (const normal of [
        [c, s],
        [-s, c]
      ] as Point[])
        for (const coordinate of [20, 60, 90, 120, 160]) {
          const offset = coordinate + normal[0] * 10 - normal[1] * 30;
          const pieces = [
            ...clipStreetBlocks(poly, normal, offset),
            ...clipStreetBlocks(poly, [-normal[0], -normal[1]], -offset)
          ];
          expect(
            pieces.reduce((sum, p) => sum + area(p), 0),
            JSON.stringify({ angle, normal, coordinate, pieces })
          ).toBeCloseTo(area(poly), 4);
        }
    }
  });

  it("makes connected compact blocks in concave districts without exposing triangular seams", () => {
    const face: Face = {
      id: "district",
      boundary: [],
      site: [0, 0],
      properties: { water: "land", ward: "craftsmen", buildable: true, settlement: "core", locked: false, elevation: 0 }
    };
    const boundaries = u.map((a, i) => ({ a, b: u[(i + 1) % u.length], setback: 1.85, feature: false }));
    const fabric = buildPerimeterBlocks(face, u, boundaries, parameters, "test", true);
    const sparse = buildPerimeterBlocks(
      face,
      u,
      boundaries,
      { ...parameters, coverage: 0.5, occupancy: 0.5 },
      "test",
      true
    );
    expect(sparse.lanes).toEqual(fabric.lanes);
    expect(sparse.blocks).toEqual(fabric.blocks);
    expect(fabric.buildings.reduce((s, b) => s + area(b.polygon), 0) / area(u)).toBeGreaterThan(0.55);
    for (const b of fabric.buildings) {
      expect(pointInPolygon(polygonCentroid(b.polygon), u)).toBe(true);
      expect(b.polygon.every(p => pointInPolygon(p, u))).toBe(true);
      for (const l of fabric.lanes)
        for (const p of b.polygon)
          expect(nearestOnPolyline(p, l.points).dist).toBeGreaterThanOrEqual(l.widthMeters / 2 - 1e-5);
    }
    const seen = new Set([0]);
    for (let change = true; change; ) {
      change = false;
      fabric.lanes.forEach((a, i) => {
        if (seen.has(i)) return;
        if (
          [...seen].some(j => {
            const b = fabric.lanes[j];
            return (
              segmentSegmentHit(a.points[0], a.points[1], b.points[0], b.points[1]) ||
              a.points.some(p => nearestOnPolyline(p, b.points).dist < 1e-5) ||
              b.points.some(p => nearestOnPolyline(p, a.points).dist < 1e-5)
            );
          })
        ) {
          seen.add(i);
          change = true;
        }
      });
    }
    expect(seen.size).toBe(fabric.lanes.length);
  });

  it("respects a wide road after collinear mesh edges have been combined", () => {
    const outline: Point[] = [
      [0, 0],
      [60, 0],
      [60, 50],
      [0, 50],
      [0, 25]
    ];
    const face: Face = {
      id: "wide-road",
      boundary: [],
      properties: { water: "land", ward: "craftsmen", buildable: true, settlement: "core", locked: false, elevation: 0 }
    };
    const boundaries = outline.map((a, i) => ({
      a,
      b: outline[(i + 1) % outline.length],
      setback: i === 4 ? 14 : 2,
      feature: i === 4
    }));
    const fabric = buildPerimeterBlocks(face, outline, boundaries, parameters, "wide-road", true);
    expect(fabric.buildings.length).toBeGreaterThan(5);
    for (const b of fabric.buildings) for (const p of b.polygon) expect(p[0]).toBeGreaterThanOrEqual(14 - 1e-5);
  });
});
