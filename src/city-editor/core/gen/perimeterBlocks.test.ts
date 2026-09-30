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
  it("builds variable parcels between a wall-side lane and local street connectors", () => {
    const outline: Point[] = [
      [0, 0],
      [320, 0],
      [320, 280],
      [0, 280]
    ];
    const face: Face = {
      id: "organic-town",
      boundary: [],
      properties: { water: "land", ward: "craftsmen", buildable: true, settlement: "core", locked: false, elevation: 0 }
    };
    const boundaries = outline.map((a, i) => ({
      a,
      b: outline[(i + 1) % outline.length],
      setback: 6,
      feature: true,
      barrier: true
    }));
    const context = { hub: [160, 140] as Point, walls: boundaries.map(edge => [edge.a, edge.b] as [Point, Point]) };
    const fabric = buildPerimeterBlocks(face, outline, boundaries, parameters, "organic", true, false, context);

    expect(fabric.blocks.length).toBeGreaterThan(12);
    expect(fabric.lanes.length).toBeGreaterThan(20);
    expect(fabric.blocks.every(p => p.length >= 3)).toBe(true);
    // The wall-side lane is joined through corners and keeps both housing and
    // the road stroke inside the wall clearance.
    for (const lane of fabric.lanes)
      for (const p of lane.points) {
        expect(p[0]).toBeGreaterThanOrEqual(1.5);
        expect(p[0]).toBeLessThanOrEqual(318.5);
        expect(p[1]).toBeGreaterThanOrEqual(1.5);
        expect(p[1]).toBeLessThanOrEqual(278.5);
      }
    for (const building of fabric.buildings)
      for (const p of building.polygon) {
        expect(p[0]).toBeGreaterThan(4.5);
        expect(p[0]).toBeLessThan(315.5);
        expect(p[1]).toBeGreaterThan(4.5);
        expect(p[1]).toBeLessThan(275.5);
      }
    let streetMargin = Infinity;
    for (const building of fabric.buildings)
      for (const point of building.polygon)
        for (const lane of fabric.lanes)
          streetMargin = Math.min(streetMargin, nearestOnPolyline(point, lane.points).dist - lane.widthMeters / 2);
    expect(streetMargin).toBeGreaterThanOrEqual(0.0125 - 1e-5);
    expect(streetMargin).toBeLessThanOrEqual(0.1);
    // Local two/three-way subdivision yields a broad range of parcel areas;
    // a uniform stack of long rectangles would have a much lower variation.
    const sizes = fabric.blocks.map(area);
    const mean = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
    const variation = Math.sqrt(sizes.reduce((sum, size) => sum + (size - mean) ** 2, 0) / sizes.length) / mean;
    expect(variation).toBeGreaterThan(0.3);
    expect(fabric.buildings.length).toBeGreaterThan(100);
    for (let i = 0; i < fabric.blocks.length; i++)
      for (let j = i + 1; j < fabric.blocks.length; j++)
        expect(overlap(fabric.blocks[i], fabric.blocks[j])).toBeLessThan(1e-4);
    expect(buildPerimeterBlocks(face, outline, boundaries, parameters, "organic", true, false, context)).toEqual(
      fabric
    );
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

  it("packs ribbon blocks back-to-back across the spine without leaving a central donut hole", () => {
    // A typical medieval ribbon block: 70m long, 30m wide (thickness for two houses back-to-back)
    const ribbon: Point[] = [
      [0, 0],
      [70, 0],
      [70, 30],
      [0, 30]
    ];
    const buildings = houses(ribbon);
    // Center point of the ribbon block: (35, 15).
    // In a donut packing, the center (35, 15) would fall in a hollow open courtyard.
    // In back-to-back packing, buildings meet along the spine (y = 15).
    const topRow = buildings.filter(p => p.some(q => q[1] > 15));
    const bottomRow = buildings.filter(p => p.some(q => q[1] < 15));
    expect(topRow.length).toBeGreaterThan(4);
    expect(bottomRow.length).toBeGreaterThan(4);
    // Buildings should reach right up to the central spine (y ≈ 15) from both sides
    const maxBottomDepth = Math.max(...bottomRow.flatMap(p => p.map(q => q[1])));
    const minTopDepth = Math.min(...topRow.flatMap(p => p.map(q => q[1])));
    expect(maxBottomDepth).toBeGreaterThanOrEqual(14.5);
    expect(minTopDepth).toBeLessThanOrEqual(15.5);
    // No central open donut cavity across the block width
    expect(buildings.reduce((sum, p) => sum + area(p), 0) / area(ribbon)).toBeGreaterThan(0.75);
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
          expect(
            nearestOnPolyline(p, l.points).dist,
            JSON.stringify({ building: b.polygon, lane: l.points, distance: nearestOnPolyline(p, l.points).dist })
          ).toBeGreaterThanOrEqual(l.widthMeters / 2 - 1e-5);
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

  it("creates barrier lanes along walls and rivers and keeps clearance for buildings", () => {
    const outline: Point[] = [
      [0, 0],
      [120, 0],
      [120, 100],
      [0, 100]
    ];
    const face: Face = {
      id: "wall-face",
      boundary: [],
      properties: { water: "land", ward: "craftsmen", buildable: true, settlement: "core", locked: false, elevation: 0 }
    };
    // Edge 0 (y=0) is a wall barrier
    const boundaries = outline.map((a, i) => ({
      a,
      b: outline[(i + 1) % outline.length],
      setback: i === 0 ? 6 : 2,
      feature: i === 0,
      barrier: i === 0
    }));
    const fabric = buildPerimeterBlocks(face, outline, boundaries, parameters, "barrier-test", true);
    // A barrier lane along the wall must be generated
    const wallLanes = fabric.lanes.filter(l => l.points.every(p => p[1] > 4.5 && p[1] < 6.0));
    expect(wallLanes.length).toBeGreaterThan(0);
    // Buildings must not touch the wall (must stay beyond wall clearance)
    for (const b of fabric.buildings) {
      for (const p of b.polygon) {
        expect(p[1]).toBeGreaterThanOrEqual(6.6 - 1e-5);
      }
    }
  });

  it("keeps interior houses quadrilateral and preserves exterior bends", () => {
    const obliqueBlocks: Point[][] = [
      rect,
      [
        [0, 0],
        [80, 15],
        [70, 75],
        [-10, 60]
      ],
      [
        [10, 10],
        [90, 20],
        [60, 80],
        [0, 50]
      ]
    ];
    for (const block of obliqueBlocks) {
      const blds = houses(block);
      expect(blds.length).toBeGreaterThan(4);
      for (const b of blds) {
        expect([4, 5]).toContain(b.length);
        if (b.length === 5)
          expect(b.some(p => block.some(corner => Math.hypot(p[0] - corner[0], p[1] - corner[1]) < 1e-4))).toBe(true);
      }
    }
  });

  it("produces townhouse-style rectangular buildings along primary roads with short side facing the road", () => {
    const outline: Point[] = [
      [0, 0],
      [100, 0],
      [100, 80],
      [0, 80]
    ];
    const face: Face = {
      id: "main-street-face",
      boundary: [],
      properties: { water: "land", ward: "craftsmen", buildable: true, settlement: "core", locked: false, elevation: 0 }
    };
    // Edge 0 (y=0, from [0,0] to [100,0]) is the primary wide road
    const boundaries = outline.map((a, i) => ({
      a,
      b: outline[(i + 1) % outline.length],
      setback: i === 0 ? 5 : 2,
      feature: i === 0,
      barrier: false
    }));
    const fabric = buildPerimeterBlocks(face, outline, boundaries, undefined, "primary-townhouse-test", true);
    expect(fabric.buildings.length).toBeGreaterThan(8);

    // Filter buildings along the primary road (y ≈ 5m setback)
    const primaryBuildings = fabric.buildings.filter(b => b.polygon.some(p => Math.abs(p[1] - 5.0) < 0.2));
    expect(primaryBuildings.length).toBeGreaterThan(5);

    for (const b of primaryBuildings) {
      // Must be 4 vertices (rectangular/trapezoidal)
      expect(b.polygon.length).toBe(4);
      const frontage = b.polygon.filter(p => Math.abs(p[1] - 5) < 0.2);
      expect(frontage).toHaveLength(2);
      const frontageWidth = Math.abs(frontage[1][0] - frontage[0][0]);
      const ys = b.polygon.map(p => p[1]);
      const depth = Math.max(...ys) - Math.min(...ys);

      // Must be short-side frontage (depth >= frontageWidth)
      expect(depth).toBeGreaterThanOrEqual(frontageWidth * 0.95);
      expect(frontageWidth).toBeGreaterThanOrEqual(3.5);
      expect(frontageWidth).toBeLessThanOrEqual(7.5);
    }
  });

  it("produces courtyard-type blocks with central open courtyard enclosed by buildings", () => {
    // A single wide block (80m x 40m) designed to form a courtyard block
    const block: Point[] = [
      [0, 0],
      [80, 0],
      [80, 40],
      [0, 40]
    ];
    const buildings = frontageBuildings(
      block,
      [0, 1, 2, 3],
      {
        lotArea: 100,
        coverage: 0.75, // Leaves ~25% central yard
        perimeter: true,
        occupancy: 1,
        outskirts: false
      },
      makeRng("courtyard-test")
    );
    expect(buildings.length).toBeGreaterThan(8);

    // Buildings must strictly be 4 vertices (rectangles / trapezoids) along straight grid
    for (const b of buildings) {
      expect(b.length).toBe(4);
    }

    // The center of the block [40, 20] must remain open as a courtyard
    const centerPoint: Point = [40, 20];
    const buildingsAtCenter = buildings.filter(b => pointInPolygon(centerPoint, b));
    expect(buildingsAtCenter).toHaveLength(0);

    // Buildings along both opposing long edges (y=0 and y=40)
    const southBuildings = buildings.filter(b => b.some(p => Math.abs(p[1]) < 1e-4));
    const northBuildings = buildings.filter(b => b.some(p => Math.abs(p[1] - 40) < 1e-4));
    expect(southBuildings.length).toBeGreaterThan(3);
    expect(northBuildings.length).toBeGreaterThan(3);

    // The gap between opposing rows in the center must be a substantial courtyard (>= 8m)
    const southMaxY = Math.max(...southBuildings.flatMap(b => b.map(p => p[1])));
    const northMinY = Math.min(...northBuildings.flatMap(b => b.map(p => p[1])));
    expect(northMinY - southMaxY).toBeGreaterThanOrEqual(8.0);
  });

  it("inspects road frontage aspect ratio in organic city", async () => {
    const { createGridDocument } = await import("../document");
    const { defaultGenerationSettings, generateCityOnDocument } = await import("../generate");
    const { buildBlockFabric } = await import("./blockInfill");

    const grid = createGridDocument({ size: "small", grid: "hex", seed: "test-organic" });
    const settings = defaultGenerationSettings();
    settings.layout = "organic";
    const city = generateCityOnDocument(grid, settings, "test-organic");
    expect(city).not.toBeNull();
    if (!city) return;

    const fabric = buildBlockFabric(city);

    // Find roads inside walls
    const { kindEdgeIds } = await import("../passages");
    const { nearestOnPolyline } = await import("./geom");
    const roads = kindEdgeIds(city, "road");
    const walls = kindEdgeIds(city, "wall");
    const _wallVertices = new Set([...walls].flatMap(id => [city.mesh.edges[id].a, city.mesh.edges[id].b]));

    // Road segments
    const roadSegments: [Point, Point][] = [];
    for (const rId of roads) {
      const e = city.mesh.edges[rId];
      roadSegments.push([city.mesh.vertices[e.a].point, city.mesh.vertices[e.b].point]);
    }

    let roadBuildingsCount = 0;
    let _wideFrontageCount = 0; // frontage > depth (長辺接道)
    let narrowFrontageCount = 0; // depth >= frontage (短辺接道)

    for (const b of fabric.buildings) {
      const face = city.mesh.faces[b.faceId];
      if (face?.properties.settlement === "outskirts") continue; // only inside wall / core

      // Check distance of building edges to nearest road segment
      for (let i = 0; i < b.polygon.length; i++) {
        const p1 = b.polygon[i];
        const p2 = b.polygon[(i + 1) % b.polygon.length];
        const edgeLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        if (edgeLen < 1.0) continue;
        const mid: Point = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];

        // Is this edge very close to a road segment?
        let minDist = Infinity;
        let roadDir: Point | null = null;
        for (const [rA, rB] of roadSegments) {
          const hit = nearestOnPolyline(mid, [rA, rB]);
          if (hit.dist < minDist) {
            minDist = hit.dist;
            const rLen = Math.hypot(rB[0] - rA[0], rB[1] - rA[1]);
            roadDir = [(rB[0] - rA[0]) / rLen, (rB[1] - rA[1]) / rLen];
          }
        }

        // If edge is parallel to road and within road setback (~3-6m)
        if (minDist <= 5.5 && roadDir) {
          const edgeDir: Point = [(p2[0] - p1[0]) / edgeLen, (p2[1] - p1[1]) / edgeLen];
          const dotProd = Math.abs(edgeDir[0] * roadDir[0] + edgeDir[1] * roadDir[1]);
          if (dotProd > 0.85) {
            // This edge p1-p2 is facing the road!
            roadBuildingsCount++;
            // Calculate depth perpendicular to edge
            const normal: Point = [-edgeDir[1], edgeDir[0]];
            const depths = b.polygon.map(p => Math.abs((p[0] - p1[0]) * normal[0] + (p[1] - p1[1]) * normal[1]));
            const maxDepth = Math.max(...depths);

            if (edgeLen > maxDepth * 1.05) {
              _wideFrontageCount++;
            } else {
              narrowFrontageCount++;
            }
            break;
          }
        }
      }
    }

    // Full-depth corner plots can be shallow and wide; most frontages must
    // still have their short side on the road without discarding those plots.
    expect(roadBuildingsCount).toBeGreaterThan(500);
    expect(narrowFrontageCount / roadBuildingsCount).toBeGreaterThan(0.89);
  });
});
