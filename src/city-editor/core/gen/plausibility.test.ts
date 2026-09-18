import { describe, expect, it } from "vitest";
import { createSizedDocument } from "../document";
import {
  defaultGenerationSettings,
  type GenerationSettings,
  generateStageOnDocument,
  type SiteConfig
} from "../generate";
import { facePoints } from "../mesh";
import type { CityDocument, Point } from "../types";
import {
  clipPolylineOutsidePolygon,
  nearestOnPolyline,
  pointInPolygon,
  segmentInteriorInPolygon,
  segmentPolylineIntersection
} from "./geom";
import {
  buildingOverWater,
  clipPolylinesToLand,
  countFrameReachingPolylines,
  filterBuildingsOverWater,
  landwardFarNode,
  majorityLandGatesUnserved,
  remakeUnreachableLandGates,
  splitDryWallRuns,
  wallSegmentIsDry
} from "./plausibility";
import type { Gate } from "./types";

const box: Point[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10]
];

describe("geom — polyline × polygon clip (Phase G2)", () => {
  it("segmentPolylineIntersection hits the first crossing", () => {
    const hit = segmentPolylineIntersection(
      [-5, 5],
      [15, 5],
      [
        [0, 0],
        [0, 10]
      ]
    );
    expect(hit).not.toBeNull();
    expect(hit![0]).toBeCloseTo(0, 5);
    expect(hit![1]).toBeCloseTo(5, 5);
  });

  it("segmentInteriorInPolygon is true only for a mid-in-water sample, not a shoreline graze", () => {
    expect(segmentInteriorInPolygon([2, 2], [8, 8], box)).toBe(true);
    expect(segmentInteriorInPolygon([-1, 5], [0, 5], box)).toBe(false);
    expect(segmentInteriorInPolygon([-2, 5], [12, 5], box)).toBe(true);
  });

  it("clipPolylineOutsidePolygon keeps the dry runs and drops the wet middle", () => {
    const line: Point[] = [
      [-5, 5],
      [0, 5],
      [10, 5],
      [15, 5]
    ];
    const runs = clipPolylineOutsidePolygon(line, box);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    for (const run of runs) {
      for (let i = 0; i + 1 < run.length; i++) {
        expect(segmentInteriorInPolygon(run[i], run[i + 1], box)).toBe(false);
      }
    }
  });
});

describe("plausibility filters", () => {
  it("landwardFarNode pulls a wet goal onto the shoreline, one cellSize inland", () => {
    const sea: Point[] = [
      [-20, 0],
      [0, 0],
      [0, 10],
      [-20, 10]
    ];
    const shore: Point[] = [
      [0, 0],
      [0, 10]
    ];
    const landed = landwardFarNode([5, 5], [-10, 5], sea, shore, 1, p => p);
    expect(pointInPolygon(landed, sea)).toBe(false);
    expect(landed[0]).toBeCloseTo(1, 5);
    expect(landed[1]).toBeCloseTo(5, 5);
  });

  it("countFrameReachingPolylines counts only lines that leave the window", () => {
    const half = 100;
    const toEdge: Point[] = [
      [0, 0],
      [99, 0]
    ];
    const interior: Point[] = [
      [0, 0],
      [20, 0]
    ];
    expect(countFrameReachingPolylines([toEdge, interior], half, 10)).toBe(1);
    expect(countFrameReachingPolylines([interior], half, 10)).toBe(0);
  });

  it("clipPolylinesToLand drops a fully wet line and keeps a dry one", () => {
    const dry: Point[] = [
      [20, 0],
      [30, 0]
    ];
    const wet: Point[] = [
      [2, 2],
      [8, 8]
    ];
    const out = clipPolylinesToLand([dry, wet], box);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(dry);
  });

  it("remakeUnreachableLandGates marks a land gate with no road as water", () => {
    const gates: Gate[] = [
      { point: [0, 0], borderIndex: 0, water: false },
      { point: [10, 0], borderIndex: 0, water: false }
    ];
    const roads: Point[][] = [
      [
        [20, 0],
        [10, 0]
      ]
    ];
    const out = remakeUnreachableLandGates(gates, roads, 1);
    expect(out[0].water).toBe(true);
    expect(out[1].water).toBe(false);
  });

  it("majorityLandGatesUnserved is true when more than half the land gates have no road", () => {
    const gates: Gate[] = [
      { point: [0, 0], borderIndex: 0, water: false },
      { point: [10, 0], borderIndex: 0, water: false },
      { point: [20, 0], borderIndex: 0, water: true }
    ];
    expect(majorityLandGatesUnserved(gates, [], 1)).toBe(true);
    expect(
      majorityLandGatesUnserved(
        gates,
        [
          [
            [0, 10],
            [0, 0]
          ]
        ],
        1
      )
    ).toBe(false);
  });

  it("wallSegmentIsDry is false when the edge mid sits in the water", () => {
    expect(wallSegmentIsDry([2, 2], [8, 2], box)).toBe(false);
    expect(wallSegmentIsDry([20, 0], [30, 0], box)).toBe(true);
    expect(wallSegmentIsDry([2, 2], [8, 2], null)).toBe(true);
  });

  it("splitDryWallRuns keeps a closed dry loop and splits a wet gap into open runs", () => {
    const points: Point[] = [
      [-5, 5],
      [15, 5],
      [15, -5],
      [-5, -5]
    ];
    const segs = ["a", "b", "c", "d"];
    expect(splitDryWallRuns(points, segs, null)).toEqual([segs]);
    const runs = splitDryWallRuns(points, segs, box);
    expect(runs).toEqual([["b", "c", "d"]]);
  });

  it("filterBuildingsOverWater drops a piece whose centroid is in the water", () => {
    const over: Point[] = [
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4]
    ];
    const dry: Point[] = [
      [20, 20],
      [22, 20],
      [22, 22],
      [20, 22]
    ];
    expect(buildingOverWater(over, box)).toBe(true);
    expect(filterBuildingsOverWater([over, dry], box)).toEqual([dry]);
  });
});

function settings(overrides: Partial<SiteConfig>, streets?: GenerationSettings["streets"]): GenerationSettings {
  const base = defaultGenerationSettings();
  return { config: { ...base.config, ...overrides }, streets: { ...base.streets, ...streets } };
}

const COASTS = ["straight", "bay", "cape"] as const;
const SEEDS = ["g2-a", "g2-b", "g2-c"];

function seaPolygons(document: CityDocument): Point[][] {
  return Object.values(document.mesh.faces)
    .filter(f => f.properties.water === "sea")
    .map(f => facePoints(document.mesh, f));
}

function edgeMid(document: CityDocument, edgeId: string): Point | null {
  const edge = document.mesh.edges[edgeId];
  if (!edge) return null;
  const a = document.mesh.vertices[edge.a]?.point;
  const b = document.mesh.vertices[edge.b]?.point;
  if (!a || !b) return null;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function kindMids(document: CityDocument, kind: "road" | "wall"): Point[] {
  const out: Point[] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== kind) continue;
    for (const segment of group.segments) {
      const mid = edgeMid(document, segment.edgeId);
      if (mid) out.push(mid);
    }
  }
  return out;
}

describe("Phase G2 — generated roads and walls stay off the water", () => {
  const base = createSizedDocument("small", "g2-mesh");

  it("4 coast scenarios × several seeds: no road or wall edge mid sits in a sea cell", () => {
    const scenarios: { name: string; settings: GenerationSettings }[] = [
      ...COASTS.map(coast => ({
        name: coast,
        settings: settings({
          coast,
          rivers: [],
          features: { walls: true, citadel: false, plaza: true, temple: false, port: true, shanty: false }
        })
      })),
      {
        name: "bay + river",
        settings: settings({
          coast: "bay",
          rivers: ["toCoast"],
          features: { walls: true, citadel: false, plaza: true, temple: false, port: true, shanty: false }
        })
      }
    ];
    let checked = 0;
    for (const scenario of scenarios) {
      for (const seed of SEEDS) {
        const out = generateStageOnDocument(base, scenario.settings, seed, 5);
        expect(out, `${scenario.name}/${seed} returned null`).not.toBeNull();
        if (!out) continue;
        const seas = seaPolygons(out);
        if (!seas.length) continue;
        for (const kind of ["road", "wall"] as const) {
          for (const mid of kindMids(out, kind)) {
            const inSea = seas.some(poly => {
              if (poly.length < 3 || !pointInPolygon(mid, poly)) return false;
              const ring = [...poly, poly[0]];
              return nearestOnPolyline(mid, ring).dist > 0.05;
            });
            expect(inSea, `${scenario.name}/${seed} ${kind} mid ${mid} in sea`).toBe(false);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("avoidSea off restores a road that may sit in a sea cell (synthetic mesh already covered in streets.test)", () => {
    // The generate path with avoidSea:false still tags sea cells and still
    // routes; at least one coastal seed should then produce a road mid inside
    // a sea face, or produce more road edges than the avoidSea:true twin.
    const on = settings({
      coast: "bay",
      rivers: [],
      features: { walls: true, citadel: false, plaza: true, temple: false, port: true, shanty: false }
    });
    const off: GenerationSettings = { ...on, streets: { ...on.streets, avoidSea: false } };
    let differed = false;
    for (const seed of [...SEEDS, "g2-d", "g2-e", "g2-f", "g2-g", "g2-h"]) {
      const a = generateStageOnDocument(base, on, seed, 5);
      const b = generateStageOnDocument(base, off, seed, 5);
      const roadsA =
        a?.featureGroups.filter(g => g.kind === "road").flatMap(g => (g.kind === "road" ? g.segments : [])) ?? [];
      const roadsB =
        b?.featureGroups.filter(g => g.kind === "road").flatMap(g => (g.kind === "road" ? g.segments : [])) ?? [];
      if (JSON.stringify(roadsA) !== JSON.stringify(roadsB)) {
        differed = true;
        break;
      }
    }
    expect(differed).toBe(true);
  });

  it("is deterministic in (document, settings, seed) with the G2 knobs set", () => {
    const s = settings(
      {
        coast: "straight",
        rivers: ["toCoast"],
        features: { walls: true, citadel: true, plaza: true, temple: false, port: true, shanty: false }
      },
      { farNode: "radial", avoidSea: true, foldSmoothing: true }
    );
    const a = generateStageOnDocument(base, s, "g2-det", 5);
    const b = generateStageOnDocument(base, s, "g2-det", 5);
    expect(JSON.stringify(a?.featureGroups)).toEqual(JSON.stringify(b?.featureGroups));
  });
});
