import { describe, expect, it } from "vitest";
import type { FixedBurgCrossings } from "../../utils/fixedBurgCrossings";
import type { CityDocument, Mesh, Point, RiverGroup, WaterKind } from "../types/document";
import { riverRibbons } from "./bridgeDeck";
import { oceanShoreSegments } from "./coastalSuitability";
import { nearestOnPolyline, pointInPolygon } from "./geom";
import { triangularInfillParts } from "./lotGeometry";
import { facePoints } from "./mesh";
import {
  classifyTownWater,
  riverRibbonRing,
  strictWet,
  TOWN_WATER_COLOR,
  type TownWaterPart,
  townGroundPolygons,
  townWaterStamp
} from "./townWater";

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

function sameRing(a: readonly Point[], b: readonly Point[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((point, index) => Math.hypot(point[0] - b[index][0], point[1] - b[index][1]) < 1e-6);
}

function inTriangle(point: Point, triangle: Point[]): boolean {
  const sign = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = sign(point, triangle[0], triangle[1]);
  const d2 = sign(point, triangle[1], triangle[2]);
  const d3 = sign(point, triangle[2], triangle[0]);
  const hasNeg = d1 < -1e-8 || d2 < -1e-8 || d3 < -1e-8;
  const hasPos = d1 > 1e-8 || d2 > 1e-8 || d3 > 1e-8;
  return !(hasNeg && hasPos);
}

function covered(point: Point, polygons: readonly Point[][]): boolean {
  return polygons.some(polygon => (polygon.length === 3 ? inTriangle(point, polygon) : pointInPolygon(point, polygon)));
}

function edgeKey(a: Point, b: Point): string {
  const text = (point: Point) => `${Math.round(point[0] * 1000) / 1000},${Math.round(point[1] * 1000) / 1000}`;
  return [text(a), text(b)].sort().join("|");
}

function owners(point: Point, parts: readonly TownWaterPart[]): number {
  return parts.filter(
    part =>
      pointInPolygon(point, part.polygon) && nearestOnPolyline(point, [...part.polygon, part.polygon[0]]).dist > 1e-4
  ).length;
}

function assertSingleCover(parts: readonly TownWaterPart[], earlier: readonly Point[][]): void {
  const box = earlier.reduce(
    (acc, ring) => {
      for (const [x, y] of ring) {
        acc[0] = Math.min(acc[0], x);
        acc[1] = Math.min(acc[1], y);
        acc[2] = Math.max(acc[2], x);
        acc[3] = Math.max(acc[3], y);
      }
      return acc;
    },
    [Infinity, Infinity, -Infinity, -Infinity]
  );
  let double = 0;
  for (let x = box[0]; x <= box[2]; x += 0.5) {
    for (let y = box[1]; y <= box[3]; y += 0.5) {
      const point: Point = [x, y];
      const count = owners(point, parts);
      if (count > 1) double += 1;
      const insideEarlier = earlier.some(
        ring => pointInPolygon(point, ring) && nearestOnPolyline(point, [...ring, ring[0]]).dist > 0.002
      );
      if (insideEarlier) expect(count).toBe(1);
    }
  }
  expect(double).toBe(0);
}

describe("town water", () => {
  it("paints town classes, including a generated lake haven as ocean", () => {
    expect(TOWN_WATER_COLOR).toEqual({
      ocean: 0x456d7f,
      lake: 0x527f8b,
      channel: 0x456d7f,
      river: 0x527f8b
    });
    const mesh = emptyMesh();
    addRect(mesh, "sea", -20, -20, 20, 20, "sea");
    const haven = document({
      mesh,
      coastalOceanFaceIds: [],
      regionalWaterAreas: [rect(-80, -80, 80, 80)],
      regionalSurface: {
        features: [{ kind: "water", ring: rect(50, 50, 60, 60) }],
        unknown: []
      }
    });
    const water = classifyTownWater(haven);
    expect(water.parts.length).toBeGreaterThan(0);
    expect(water.parts.every(part => part.kind === "ocean")).toBe(true);
    expect(water.parts.some(part => part.kind === "lake")).toBe(false);

    const mesh2 = emptyMesh();
    addRect(mesh2, "lake", 0, 30, 10, 40, "lake");
    addRect(mesh2, "open", 20, 30, 30, 40, "openWater");
    addRect(mesh2, "sea", 40, 30, 50, 40, "sea");
    const kinds = classifyTownWater(document({ mesh: mesh2, coastalOceanFaceIds: ["other"] }));
    expect(kinds.parts.find(part => sameRing(part.polygon, rect(0, 30, 10, 40)))?.kind).toBe("lake");
    expect(kinds.parts.find(part => sameRing(part.polygon, rect(20, 30, 30, 40)))?.kind).toBe("ocean");
    expect(kinds.parts.find(part => sameRing(part.polygon, rect(40, 30, 50, 40)))?.kind).toBe("ocean");
    expect(
      kinds.parts.some(part => part.kind === "lake" && sameRing(part.polygon, facePoints(mesh2, mesh2.faces.sea)))
    ).toBe(false);
  });

  it("keeps a listed sea face and omits neighbouring land", () => {
    const mesh = emptyMesh();
    addRect(mesh, "land", 0, 0, 10, 10, "land");
    addRect(mesh, "sea", 10, 0, 20, 10, "sea");
    const water = classifyTownWater(document({ mesh, coastalOceanFaceIds: ["sea"] }));
    const sea = facePoints(mesh, mesh.faces.sea);
    expect(water.parts.some(part => part.kind === "ocean" && sameRing(part.polygon, sea))).toBe(true);
    expect(water.parts.some(part => sameRing(part.polygon, facePoints(mesh, mesh.faces.land)))).toBe(false);
  });

  it("draws a valid river channel crossing the origin", () => {
    const mesh = emptyMesh();
    addRect(mesh, "under", -8, -8, 8, 8, "sea");
    const channel = rect(-10, -10, 10, 10);
    const doc = document({ mesh, waterAreas: [{ kind: "river", polygon: channel }] });
    const water = classifyTownWater(doc);
    expect(water.parts.some(part => part.kind === "channel" && sameRing(part.polygon, channel))).toBe(true);
    expect(water.reserved).toHaveLength(0);
    expect(
      covered(
        [0, 0],
        water.parts.map(part => part.polygon)
      )
    ).toBe(true);
  });

  it("reserves a ring that cannot be triangulated and refills the face under it", () => {
    const mesh = emptyMesh();
    addRect(mesh, "under", 2, 2, 3, 3, "sea");
    const doc = document({ mesh, waterAreas: [{ kind: "river", polygon: FAILED_RING }] });
    const water = classifyTownWater(doc);
    const sample: Point = [2.2, 2.05];
    expect(water.reserved.some(ring => sameRing(ring, FAILED_RING))).toBe(true);
    expect(
      covered(
        sample,
        water.parts.map(part => part.polygon)
      )
    ).toBe(false);
    expect(water.landRefill.some(tri => tri.length === 3 && inTriangle(sample, tri))).toBe(true);
  });

  it("keeps an unobstructed river on the ribbon and drops a one-vertex group", () => {
    const mesh = emptyMesh();
    mesh.vertices.a = { id: "a", point: [0, 0], locked: false };
    mesh.vertices.b = { id: "b", point: [10, 0], locked: false };
    mesh.vertices.c = { id: "c", point: [1, 1], locked: false };
    const doc = document({
      mesh,
      featureGroups: [river("main", ["a", "b"], 4), river("stub", ["c"], 4)]
    });
    const ribbons = riverRibbons(doc);
    expect(ribbons).toHaveLength(1);
    const water = classifyTownWater(doc);
    const rivers = water.parts.filter(part => part.kind === "river");
    expect(rivers).toHaveLength(1);
    expect(rivers[0].widthMeters).toBe(ribbons[0].width);
    expect(sameRing(rivers[0].centerline!, ribbons[0].points)).toBe(true);
    expect(sameRing(rivers[0].polygon, riverRibbonRing(ribbons[0].points, ribbons[0].width)!)).toBe(true);
    const straight = riverRibbonRing(
      [
        [0, 0],
        [10, 0]
      ],
      4
    );
    expect(straight).toEqual([
      [0, 2],
      [10, 2],
      [10, -2],
      [0, -2]
    ]);
    expect(
      riverRibbonRing(
        [
          [0, 0],
          [1e-8, 0],
          [10, 0]
        ],
        4
      )
    ).not.toBeNull();
    expect(
      riverRibbonRing(
        [
          [0, 0],
          [10, 0],
          [0, 0]
        ],
        4
      )
    ).not.toBeNull();
  });

  it("draws a stair-stepped river when the mitered ribbon cannot be triangulated", () => {
    const jog: Point[] = [
      [-230.61, -92.72],
      [-238.59, -86.85],
      [-246.49, -81.03],
      [-246.54, -80.99],
      [-248.09, -79.85],
      [-244.49, -76.06]
    ];
    const width = 15.9;
    const mesh = emptyMesh();
    jog.forEach((point, index) => {
      const id = `j${index}`;
      mesh.vertices[id] = { id, point, locked: false };
    });
    expect(triangularInfillParts(riverRibbonRing(jog, width)!).length).toBe(0);
    const water = classifyTownWater(
      document({
        mesh,
        featureGroups: [
          river(
            "jog",
            jog.map((_, index) => `j${index}`),
            width
          )
        ]
      })
    );
    const drawn = water.parts.filter(part => part.kind === "river");
    expect(drawn).toHaveLength(1);
    expect(drawn[0].centerline).toEqual(jog);
    expect(drawn[0].widthMeters).toBe(width);
    const mid: Point = [(jog[0][0] + jog[1][0]) / 2, (jog[0][1] + jog[1][1]) / 2];
    expect(pointInPolygon(mid, drawn[0].polygon)).toBe(true);
    expect(pointInPolygon([0, 0], drawn[0].polygon)).toBe(false);
    expect(water.reserved).toHaveLength(0);
  });

  it("cuts a river where it enters earlier water", () => {
    const mesh = emptyMesh();
    addRect(mesh, "sea", 0, 0, 20, 20, "sea");
    mesh.vertices.up = { id: "up", point: [5, 30], locked: false };
    mesh.vertices.down = { id: "down", point: [15, -5], locked: false };
    const doc = document({ mesh, featureGroups: [river("mouth", ["up", "down"], 6)] });
    const water = classifyTownWater(doc);
    const prior = water.parts.filter(part => part.kind !== "river").map(part => part.polygon);
    const sample: Point = [10.7, 10];
    expect(strictWet(sample, prior)).toBe(true);
    expect(water.parts.filter(part => part.kind === "river").some(part => pointInPolygon(sample, part.polygon))).toBe(
      false
    );
  });

  it("covers a surveyed overlap, a river mouth, and an offshore island once", () => {
    const channel = rect(20, 0, 40, 20);
    const survey = rect(30, -10, 55, 30);
    const mesh = emptyMesh();
    addRect(mesh, "land", -5, -5, 5, 5, "land");
    const surveyed = document({
      mesh,
      waterAreas: [{ kind: "river", polygon: channel }],
      importedFixedCrossings: {
        schemaVersion: 2,
        rivers: [{ rings: [survey] }]
      } as unknown as FixedBurgCrossings
    });
    const surveyedWater = classifyTownWater(surveyed);
    assertSingleCover(surveyedWater.parts, [channel]);

    const mouthMesh = emptyMesh();
    addRect(mouthMesh, "sea", 0, 0, 20, 20, "sea");
    mouthMesh.vertices.up = { id: "up", point: [5, 30], locked: false };
    mouthMesh.vertices.down = { id: "down", point: [15, -5], locked: false };
    const mouth = classifyTownWater(document({ mesh: mouthMesh, featureGroups: [river("mouth", ["up", "down"], 6)] }));
    assertSingleCover(mouth.parts, [rect(0, 0, 20, 20)]);

    const islandMesh = emptyMesh();
    addRect(islandMesh, "town", -20, -20, 20, 20, "land");
    const island = document({
      mesh: islandMesh,
      regionalWaterAreas: [rect(-80, -80, 80, 80)],
      regionalSurface: {
        features: [
          { kind: "land", ring: rect(30, 30, 50, 50) },
          { kind: "water", ring: rect(35, 35, 45, 45) }
        ],
        unknown: []
      }
    });
    const islandWater = classifyTownWater(island);
    const seaParts = islandWater.parts.filter(part => part.kind === "ocean").map(part => part.polygon);
    assertSingleCover(islandWater.parts, seaParts);
    const lake: Point = [40, 40];
    expect(owners(lake, islandWater.parts)).toBe(1);
    const ground = townGroundPolygons(island, islandWater);
    expect(ground.land.some(tri => tri.length === 3 && inTriangle(lake, tri))).toBe(false);
    expect(ground.land.some(tri => tri.length === 3 && inTriangle([32, 32], tri))).toBe(true);
  });

  it("matches listed salt shores and still paints unlisted sea", () => {
    const mesh = emptyMesh();
    const landId = "land";
    const listedId = "listed";
    const otherId = "other";
    const vertices: Record<string, Point> = {
      a: [0, 0],
      b: [10, 0],
      c: [10, 10],
      d: [0, 10],
      e: [20, 0],
      f: [20, 10],
      g: [0, 20],
      h: [10, 20]
    };
    for (const [id, point] of Object.entries(vertices)) mesh.vertices[id] = { id, point, locked: false };
    const edges = {
      ab: ["a", "b"],
      bc: ["b", "c"],
      cd: ["c", "d"],
      da: ["d", "a"],
      be: ["b", "e"],
      ef: ["e", "f"],
      fc: ["f", "c"],
      dg: ["d", "g"],
      gh: ["g", "h"],
      hc: ["h", "c"]
    } as const;
    for (const [id, [a, b]] of Object.entries(edges)) {
      mesh.edges[id] = { id, a, b, leftFace: null, rightFace: null, locked: false };
    }
    const face = (id: string, boundary: [string, boolean][], water: WaterKind) => {
      mesh.faces[id] = {
        id,
        boundary: boundary.map(([edgeId, forward]) => ({ edgeId, forward })),
        properties: {
          elevation: water === "land" ? 1 : 0,
          water,
          ward: null,
          buildable: water === "land",
          locked: false
        }
      };
    };
    face(
      landId,
      [
        ["ab", true],
        ["bc", true],
        ["cd", true],
        ["da", true]
      ],
      "land"
    );
    face(
      listedId,
      [
        ["be", true],
        ["ef", true],
        ["fc", true],
        ["bc", false]
      ],
      "sea"
    );
    face(
      otherId,
      [
        ["dg", true],
        ["gh", true],
        ["hc", true],
        ["cd", false]
      ],
      "sea"
    );
    mesh.edges.ab.leftFace = landId;
    mesh.edges.bc.leftFace = landId;
    mesh.edges.bc.rightFace = listedId;
    mesh.edges.cd.leftFace = landId;
    mesh.edges.cd.rightFace = otherId;
    mesh.edges.da.leftFace = landId;
    mesh.edges.be.leftFace = listedId;
    mesh.edges.ef.leftFace = listedId;
    mesh.edges.fc.leftFace = listedId;
    mesh.edges.dg.leftFace = otherId;
    mesh.edges.gh.leftFace = otherId;
    mesh.edges.hc.leftFace = otherId;
    const doc = document({ mesh, coastalOceanFaceIds: [listedId] });
    const water = classifyTownWater(doc);
    const shore = new Set(oceanShoreSegments(doc).map(([a, b]) => edgeKey(a, b)));
    const listed = facePoints(mesh, mesh.faces.listed);
    const land = facePoints(mesh, mesh.faces.land);
    const other = facePoints(mesh, mesh.faces.other);
    const shared = (ring: Point[], neighbor: Point[]) => {
      const keys: string[] = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const key = edgeKey(a, b);
        for (let j = 0; j < neighbor.length; j++) {
          if (edgeKey(neighbor[j], neighbor[(j + 1) % neighbor.length]) === key) keys.push(key);
        }
      }
      return keys;
    };
    expect(new Set(shared(listed, land))).toEqual(shore);
    for (const key of shared(other, land)) expect(shore.has(key)).toBe(false);
    expect(water.parts.some(part => part.kind === "ocean" && sameRing(part.polygon, other))).toBe(true);
  });

  it("ignores a moat and a broken survey, and stays empty inland", () => {
    const mesh = emptyMesh();
    addRect(mesh, "land", -10, -10, 10, 10, "land");
    addRect(mesh, "sea", 20, -5, 30, 5, "sea");
    const plain = document({ mesh });
    const withMoat = document({
      mesh,
      defenseCircuits: [
        {
          id: "wall",
          scope: "town",
          areaFaceIds: ["land"],
          wallGroupIds: [],
          naturalBarriers: [],
          locked: false,
          moat: { enabled: true, widthMeters: 8 }
        }
      ]
    });
    expect(classifyTownWater(withMoat).parts).toHaveLength(classifyTownWater(plain).parts.length);
    const broken = document({
      mesh,
      importedFixedCrossings: { schemaVersion: 3 } as unknown as FixedBurgCrossings
    });
    expect(() => classifyTownWater(broken)).not.toThrow();
    expect(classifyTownWater(broken).parts.some(part => part.kind === "ocean")).toBe(true);

    const inlandMesh = emptyMesh();
    addRect(inlandMesh, "land", -10, -10, 10, 10, "land");
    expect(classifyTownWater(document({ mesh: inlandMesh })).parts).toEqual([]);
  });

  it("punches the land hole with the river ring left after subtraction", () => {
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
    const rivers = water.parts.filter(part => part.kind === "river");
    const upper: Point[] = [
      [2, 20],
      [2, 8],
      [-2, 8],
      [-2, 20]
    ];
    const lower: Point[] = [
      [2, -8],
      [2, -20],
      [-2, -20],
      [-2, -8]
    ];
    expect(rivers.map(part => part.polygon)).toEqual([lower, upper]);
    expect(rivers.some(part => sameRing(part.polygon, full))).toBe(false);
    const ground = townGroundPolygons(doc, water);
    const band: Point = [0, 14];
    const outside: Point = [10, 15];
    expect(ground.land.some(tri => inTriangle(band, tri))).toBe(false);
    expect(ground.land.some(tri => inTriangle([0, 0], tri))).toBe(false);
    expect(ground.land.some(tri => inTriangle(outside, tri))).toBe(true);
  });

  it("joins the full width of an oblique river mouth to the sea without leaving a land wedge", () => {
    const mesh = emptyMesh();
    addRect(mesh, "land", 10, -40, 90, 0, "land");
    addRect(mesh, "sea", 10, 0, 90, 40, "sea");
    mesh.vertices.up = { id: "up", point: [20, -20], locked: false };
    mesh.vertices.mouth = { id: "mouth", point: [40, 0], locked: false };
    const doc = document({ mesh, featureGroups: [river("mouth", ["up", "mouth"], 8)] });
    const before = JSON.stringify(doc);
    const water = classifyTownWater(doc);
    const mouth: Point = [43, -1];
    expect(
      strictWet(
        mouth,
        water.parts.map(part => part.polygon)
      )
    ).toBe(true);
    const ground = townGroundPolygons(doc, water);
    expect(ground.land.some(triangle => pointInPolygon(mouth, triangle))).toBe(false);
    expect(ground.land.some(triangle => pointInPolygon([50, -1], triangle))).toBe(true);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("changes the stamp for water kind, coordinates, and elevation, not the salt list", () => {
    const mesh = emptyMesh();
    addRect(mesh, "sea", 0, 0, 10, 10, "sea");
    const doc = document({
      mesh,
      coastalOceanFaceIds: ["sea"],
      waterAreas: [{ kind: "river", polygon: rect(30, 30, 40, 40) }]
    });
    const sea = townWaterStamp(doc);
    doc.mesh.faces.sea.properties.water = "lake";
    expect(townWaterStamp(doc)).not.toBe(sea);
    doc.mesh.faces.sea.properties.water = "sea";
    const restored = townWaterStamp(doc);
    expect(restored).toBe(sea);
    doc.waterAreas![0].polygon[0][0] += 1;
    expect(townWaterStamp(doc)).not.toBe(restored);
    const moved = townWaterStamp(doc);
    doc.coastalOceanFaceIds = ["absent"];
    expect(townWaterStamp(doc)).toBe(moved);
    addRect(mesh, "land", -10, -10, 0, 0, "land");
    const withLand = townWaterStamp(doc);
    mesh.faces.land.properties.elevation = 30;
    expect(townWaterStamp(doc)).not.toBe(withLand);
  });
});
