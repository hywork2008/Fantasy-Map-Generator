import { describe, expect, it } from "vitest";
import { boundaryEdges, boundaryRings } from "../../city-editor/generators/fortifications";
import { nearestOnPolyline, pointInPolygon } from "../../city-editor/generators/geom";
import { plotArea, subtractConvex } from "../../city-editor/generators/parcelGeometry";
import {
  classifyTownWater,
  riverRibbonRing,
  strictWet,
  type TownWaterPart,
  townGroundPolygons,
  townWaterTriangles
} from "../../city-editor/generators/townWater";
import type { CityDocument, Mesh, Point, RiverGroup, WaterKind } from "../../city-editor/types/document";
import type { TriangleSoup } from "./massingGeometry";
import { LAND_Y, WATER_Y, type WaterSurfaces, waterSurfaceGeometry } from "./waterGeometry";

const FAILED_RING: Point[] = [
  [0, 5],
  [4, 0],
  [5, 0],
  [1, 5],
  [5, 5],
  [0, 0],
  [1, 0],
  [5, 4]
];

function document(partial: Partial<CityDocument> & Pick<CityDocument, "mesh">): CityDocument {
  return {
    format: "fmg-city-editor",
    version: 4,
    frame: { extentMeters: 200, cityRadiusMeters: 80, blockSizeMeters: 40 },
    featureGroups: [],
    gates: [],
    elements: [],
    ...partial
  } as CityDocument;
}

function emptyMesh(): Mesh {
  return { vertices: {}, edges: {}, faces: {} };
}

function addRect(mesh: Mesh, id: string, x0: number, y0: number, x1: number, y1: number, water: WaterKind): void {
  const ids = [0, 1, 2, 3].map(index => `${id}v${index}`);
  const points: Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1]
  ];
  ids.forEach((vertexId, index) => {
    mesh.vertices[vertexId] = { id: vertexId, point: points[index], locked: false };
  });
  const edgeIds = [0, 1, 2, 3].map(index => `${id}e${index}`);
  const ends: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0]
  ];
  edgeIds.forEach((edgeId, index) => {
    mesh.edges[edgeId] = {
      id: edgeId,
      a: ids[ends[index][0]],
      b: ids[ends[index][1]],
      leftFace: id,
      rightFace: null,
      locked: false
    };
  });
  mesh.faces[id] = {
    id,
    boundary: edgeIds.map(edgeId => ({ edgeId, forward: true })),
    properties: { elevation: water === "land" ? 1 : 0, water, ward: null, buildable: water === "land", locked: false }
  };
}

function river(id: string, vertices: string[], widthMeters: number): RiverGroup {
  return {
    id,
    kind: "river",
    name: id,
    vertices,
    source: null,
    mouth: null,
    style: { widthMeters, color: "#527f8b" },
    locked: false
  };
}

function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1]
  ];
}

function inTriangle(point: Point, triangle: Point[]): boolean {
  const sign = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = sign(point, triangle[0], triangle[1]);
  const d2 = sign(point, triangle[1], triangle[2]);
  const d3 = sign(point, triangle[2], triangle[0]);
  return !(d1 < -1e-8 || d2 < -1e-8 || d3 < -1e-8) || !(d1 > 1e-8 || d2 > 1e-8 || d3 > 1e-8);
}

interface ReadTri {
  p: [number, number, number][];
  n: [number, number, number];
}

function readTris(soup: TriangleSoup): ReadTri[] {
  const out: ReadTri[] = [];
  for (let i = 0; i < soup.positions.length; i += 9) {
    out.push({
      p: [0, 1, 2].map(k => {
        const offset = i + k * 3;
        return [soup.positions[offset], soup.positions[offset + 1], soup.positions[offset + 2]] as [
          number,
          number,
          number
        ];
      }),
      n: [soup.normals[i], soup.normals[i + 1], soup.normals[i + 2]]
    });
  }
  return out;
}

function planMid(tri: ReadTri): Point {
  const unique: Point[] = [];
  for (const vertex of tri.p) {
    const point: Point = [vertex[0], -vertex[2]];
    if (!unique.some(other => Math.hypot(other[0] - point[0], other[1] - point[1]) < 1e-6)) unique.push(point);
  }
  const count = unique.length || 1;
  return [
    unique.reduce((sum, point) => sum + point[0], 0) / count,
    unique.reduce((sum, point) => sum + point[1], 0) / count
  ];
}

function surfaces(polygons: Point[][]): WaterSurfaces {
  const parts: TownWaterPart[] = polygons.map(polygon => ({ kind: "channel", polygon }));
  return waterSurfaceGeometry(townWaterTriangles(parts), polygons, point => strictWet(point, polygons));
}

function near(point: Point, target: Point, epsilon = 1e-4): boolean {
  return Math.hypot(point[0] - target[0], point[1] - target[1]) < epsilon;
}

function covers(point: Point, triangles: readonly Point[][]): boolean {
  return triangles.some(triangle => triangle.length === 3 && inTriangle(point, triangle));
}

describe("water surface geometry", () => {
  it("points every water normal upward, including a downward plan ring", () => {
    const downward: Point[] = [
      [0, 0],
      [4, 0],
      [0, 4]
    ];
    const upward: Point[] = [
      [10, 0],
      [10, 4],
      [14, 0]
    ];
    const top = readTris(waterSurfaceGeometry([downward, upward], [], () => false).top);
    expect(top).toHaveLength(2);
    for (const tri of top) {
      expect(tri.n[1]).toBeGreaterThan(0.9);
      const [a, b, c] = tri.p;
      const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      expect(ny).toBeGreaterThan(0);
    }
  });

  it("emits no triangles for a one-point river or a null ribbon", () => {
    const one = emptyMesh();
    one.vertices.only = { id: "only", point: [1, 1], locked: false };
    const oneWater = classifyTownWater(document({ mesh: one, featureGroups: [river("stub", ["only"], 4)] }));
    expect(townWaterTriangles(oneWater.parts)).toEqual([]);

    const broken = emptyMesh();
    broken.vertices.a = { id: "a", point: [Number.NaN, 0], locked: false };
    broken.vertices.b = { id: "b", point: [10, 0], locked: false };
    expect(
      riverRibbonRing(
        [
          [Number.NaN, 0],
          [10, 0]
        ],
        4
      )
    ).toBeNull();
    const nullRun = classifyTownWater(document({ mesh: broken, featureGroups: [river("bad", ["a", "b"], 4)] }));
    expect(townWaterTriangles(nullRun.parts)).toEqual([]);
  });

  it("faces skirts toward dry land and skips shared edges, seams, and non-seam holes", () => {
    const channel = rect(10, 10, 30, 20);
    const land: Point = [20, 5];
    const hole = readTris(surfaces([channel]).skirt);
    const nearest = hole.reduce(
      (best, tri) => {
        const mid = planMid(tri);
        const dist = Math.hypot(mid[0] - land[0], mid[1] - land[1]);
        return dist < best.dist ? { tri, dist } : best;
      },
      { tri: hole[0], dist: Infinity }
    );
    expect(nearest.dist).toBeLessThan(6);
    const mid = planMid(nearest.tri);
    const toward: Point = [land[0] - mid[0], land[1] - mid[1]];
    expect(toward[0] * nearest.tri.n[0] - toward[1] * nearest.tri.n[2]).toBeGreaterThan(0);
    const [a, b, c] = nearest.tri.p;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vz = c[2] - a[2];
    const geometric: Point = [uy * vz - uz * (c[1] - a[1]), ux * (c[1] - a[1]) - uy * vx];
    expect(toward[0] * geometric[0] - toward[1] * geometric[1]).toBeGreaterThan(0);

    const left = rect(0, 0, 10, 10);
    const right = rect(10, 0, 20, 10);
    const shared = readTris(surfaces([left, right]).skirt);
    const seam: Point = [10, 5];
    expect(strictWet(seam, [left, right])).toBe(true);
    expect(pointInPolygon(seam, left) && nearestOnPolyline(seam, [...left, left[0]]).dist > 1e-6).toBe(false);
    expect(shared.some(tri => near(planMid(tri), seam))).toBe(false);
    expect(shared.length).toBeGreaterThan(0);

    const body = rect(0, 0, 10, 10);
    const west = rect(8, 0, 10.25, 10);
    const east = rect(10.25, 0, 20, 10);
    const decomposed = readTris(surfaces([body, west, east]).skirt);
    expect(strictWet([10.25, 5], [body, west, east])).toBe(true);
    expect(decomposed.some(tri => near(planMid(tri), [10, 5]))).toBe(false);
    expect(decomposed.some(tri => near(planMid(tri), [5, 10]))).toBe(true);
  });

  it("keeps the channel midpoint out of land and the bank beside it in land", () => {
    const mesh = emptyMesh();
    addRect(mesh, "land", -30, -5, 30, 30, "land");
    mesh.vertices.up = { id: "up", point: [0, 20], locked: false };
    mesh.vertices.down = { id: "down", point: [0, -20], locked: false };
    const doc = document({
      mesh,
      waterAreas: [{ kind: "river", polygon: rect(-8, -8, 8, 8) }],
      featureGroups: [river("cut", ["up", "down"], 4)]
    });
    const full = riverRibbonRing(
      [
        [0, 20],
        [0, -20]
      ],
      4
    )!;
    const water = classifyTownWater(doc);
    const upper: Point[] = [
      [2, 20],
      [2, 8],
      [-2, 8],
      [-2, 20]
    ];
    expect(
      water.parts
        .filter(part => part.kind === "river")
        .some(part => part.polygon.every((point, index) => near(point, upper[index], 1e-6)))
    ).toBe(true);
    expect(
      water.parts.some(
        part =>
          part.polygon.length === full.length && part.polygon.every((point, index) => near(point, full[index], 1e-6))
      )
    ).toBe(false);
    const ground = townGroundPolygons(doc, water);
    expect(covers([0, 14], ground.land)).toBe(false);
    expect(covers([10, 15], ground.land)).toBe(true);
    expect(covers([0, 0], ground.land)).toBe(true);
  });

  it("keeps a 0.01 m² remainder when minimumArea is 0.001", () => {
    const subject = rect(10, 10, 11, 11);
    const clip = rect(10, 10, 10.99, 11);
    expect(subtractConvex(subject, clip)).toEqual([]);
    const kept = subtractConvex(subject, clip, 0.001);
    expect(kept).toHaveLength(1);
    expect(plotArea(kept[0])).toBeCloseTo(0.01, 6);

    const mesh = emptyMesh();
    addRect(mesh, "land", 10, 10, 11, 11, "land");
    const doc = document({ mesh, waterAreas: [{ kind: "river", polygon: clip }] });
    const water = classifyTownWater(doc);
    const ground = townGroundPolygons(doc, water);
    expect(covers([10.5, 10.5], ground.land)).toBe(false);
    expect(covers([10.995, 10.5], ground.land)).toBe(true);
  });

  it("draws no water for a ring that will not triangulate and refills the face as land", () => {
    const mesh = emptyMesh();
    addRect(mesh, "under", 2, 2, 3, 3, "sea");
    const doc = document({ mesh, waterAreas: [{ kind: "river", polygon: FAILED_RING }] });
    const water = classifyTownWater(doc);
    const sample: Point = [2.2, 2.05];
    expect(townWaterTriangles(water.parts)).toEqual([]);
    expect(water.parts.some(part => part.kind === "channel" || part.kind === "river")).toBe(false);
    expect(covers(sample, water.landRefill)).toBe(true);
    expect(covers(sample, townGroundPolygons(doc, water).land)).toBe(true);
  });

  it("emits no outside triangles without vertices or when the boundary walk breaks", () => {
    const bare = document({
      mesh: emptyMesh(),
      regionalSurface: {
        features: [
          { kind: "land", ring: rect(150, 150, 170, 170) },
          { kind: "water", ring: rect(180, 180, 190, 190) }
        ],
        unknown: [rect(190, 150, 200, 160)]
      }
    });
    const bareWater = classifyTownWater(bare);
    const bareGround = townGroundPolygons(bare, bareWater);
    expect(bareGround.unknown).toEqual([]);
    expect(covers([160, 160], bareGround.land)).toBe(false);
    expect(
      covers(
        [185, 185],
        bareWater.parts.map(part => part.polygon)
      )
    ).toBe(false);
    expect(covers([195, 155], bareGround.unknown)).toBe(false);

    const mesh = emptyMesh();
    addRect(mesh, "land", 0, 0, 10, 10, "land");
    mesh.vertices.x = { id: "x", point: [80, 80], locked: false };
    mesh.vertices.y = { id: "y", point: [90, 80], locked: false };
    mesh.edges.xy = { id: "xy", a: "x", b: "y", leftFace: "orphan", rightFace: null, locked: false };
    mesh.faces.orphan = {
      id: "orphan",
      boundary: [{ edgeId: "xy", forward: true }],
      properties: { elevation: 1, water: "land", ward: null, buildable: true, locked: false }
    };
    expect(boundaryRings(mesh, boundaryEdges(mesh, Object.keys(mesh.faces)))).toEqual([]);
    const broken = document({
      mesh,
      regionalSurface: {
        features: [
          { kind: "land", ring: rect(40, 40, 60, 60) },
          { kind: "water", ring: rect(70, 70, 80, 80) }
        ],
        unknown: [rect(40, 70, 50, 80)]
      }
    });
    const brokenWater = classifyTownWater(broken);
    const brokenGround = townGroundPolygons(broken, brokenWater);
    expect(brokenGround.unknown).toEqual([]);
    expect(covers([50, 50], brokenGround.land)).toBe(false);
    expect(
      covers(
        [75, 75],
        brokenWater.parts.map(part => part.polygon)
      )
    ).toBe(false);
    expect(covers([45, 75], brokenGround.unknown)).toBe(false);
    expect(covers([5, 5], brokenGround.land)).toBe(true);
  });

  it("places water vertices at WATER_Y and skirt vertices on the bank step", () => {
    expect(WATER_Y).toBe(-0.55);
    expect(LAND_Y).toBe(-0.2);
    const drawn = surfaces([rect(10, 10, 30, 20)]);
    const top = readTris(drawn.top);
    const skirt = readTris(drawn.skirt);
    expect(top.length).toBeGreaterThan(0);
    expect(skirt.length).toBeGreaterThan(0);
    for (const tri of top) for (const vertex of tri.p) expect(vertex[1]).toBe(Math.fround(WATER_Y));
    for (const tri of skirt) {
      for (const vertex of tri.p) {
        const y = vertex[1];
        expect(y === Math.fround(WATER_Y) || y === Math.fround(LAND_Y)).toBe(true);
      }
      expect(Math.abs(tri.n[1])).toBeLessThan(1e-6);
    }
  });
});
