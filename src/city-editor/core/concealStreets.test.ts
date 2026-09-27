import { describe, expect, it } from "vitest";
import { clipPolylineToExterior, outerWallRing, outerWallRingFromPolylines } from "./concealStreets";
import { createSizedDocument } from "./document";
import { featureGroupVertices } from "./features";
import { nearestOnPolyline, pointInPolygon } from "./gen/geom";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";
import type { Point } from "./types";

const SQUARE: Point[] = [
  [-5, -5],
  [5, -5],
  [5, 5],
  [-5, 5],
  [-5, -5]
];

function closed(ring: Point[]): Point[] {
  return ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : [...ring, ring[0]];
}

function strictlyInside(point: Point, ring: Point[]): boolean {
  return pointInPolygon(point, ring) && nearestOnPolyline(point, closed(ring)).dist > 0.2;
}

describe("outerWallRingFromPolylines", () => {
  it("uses a closed curtain and ignores a smaller citadel ring", () => {
    const outer: Point[] = [
      [0, 0],
      [30, 0],
      [30, 30],
      [0, 30],
      [0, 0]
    ];
    const citadel: Point[] = [
      [10, 10],
      [12, 10],
      [12, 12],
      [10, 12],
      [10, 10]
    ];
    const ring = outerWallRingFromPolylines([outer, citadel], [15, 15], 5)!;
    expect(pointInPolygon([15, 15], ring)).toBe(true);
    expect(pointInPolygon([11, 11], ring)).toBe(true);
    expect(pointInPolygon([-1, 15], ring)).toBe(false);
  });

  it("stitches runs that share an endpoint and closes the remaining coastal gap", () => {
    const east: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10]
    ];
    const west: Point[] = [
      [10, 10],
      [0, 10]
    ];
    const ring = outerWallRingFromPolylines([east, west], [5, 5], 1)!;
    expect(pointInPolygon([5, 5], ring)).toBe(true);
    expect(pointInPolygon([-1, 5], ring)).toBe(false);
  });
});

describe("clipPolylineToExterior", () => {
  it("keeps the approach up to the wall and drops the street inside it", () => {
    const line: Point[] = [
      [-20, 0],
      [-5, 0],
      [0, 0],
      [5, 0],
      [20, 0]
    ];
    const runs = clipPolylineToExterior(line, SQUARE);
    expect(runs).toHaveLength(2);
    expect(runs[0][0][0]).toBeCloseTo(-20);
    expect(runs[0][runs[0].length - 1][0]).toBeCloseTo(-5);
    expect(runs[1][0][0]).toBeCloseTo(5);
    expect(runs[1][runs[1].length - 1][0]).toBeCloseTo(20);
  });

  it("cuts a single segment that crosses the town", () => {
    const runs = clipPolylineToExterior(
      [
        [-20, 0],
        [20, 0]
      ],
      SQUARE
    );
    expect(runs).toHaveLength(2);
    expect(runs[0][1][0]).toBeCloseTo(-5);
    expect(runs[1][0][0]).toBeCloseTo(5);
  });

  it("hides a street that stays inside the wall", () => {
    expect(
      clipPolylineToExterior(
        [
          [-5, 0],
          [0, 0],
          [4, 0]
        ],
        SQUARE
      )
    ).toEqual([]);
  });
});

describe("outerWallRing on a generated town", () => {
  it("contains the plaza, leaves the map corner outside, and shortens roads that enter the wall", () => {
    const input = createSizedDocument("tiny", "conceal-wall");
    const settings = defaultGenerationSettings();
    settings.config.features.walls = true;
    const city = generateCityOnDocument(input, settings, "conceal-wall");
    expect(city).not.toBeNull();
    const ring = outerWallRing(city!);
    expect(ring).not.toBeNull();
    const plaza = city!.elements.find(element => element.kind === "plaza")?.point ?? [0, 0];
    expect(pointInPolygon(plaza, ring!)).toBe(true);
    const corner: Point = [city!.frame.extentMeters / 2 - 1, city!.frame.extentMeters / 2 - 1];
    expect(pointInPolygon(corner, ring!)).toBe(false);

    let hid = false;
    let kept = false;
    for (const group of city!.featureGroups) {
      if (group.kind !== "road") continue;
      const points = featureGroupVertices(city!, group).map(id => city!.mesh.vertices[id].point);
      const runs = clipPolylineToExterior(points, ring!);
      if (runs.length) kept = true;
      if (runs.reduce((sum, run) => sum + run.length, 0) < points.length) hid = true;
      for (const run of runs) {
        for (let i = 0; i + 1 < run.length; i++) {
          const mid: Point = [(run[i][0] + run[i + 1][0]) / 2, (run[i][1] + run[i + 1][1]) / 2];
          expect(strictlyInside(mid, ring!)).toBe(false);
        }
      }
    }
    expect(hid).toBe(true);
    expect(kept).toBe(true);
  });
});
