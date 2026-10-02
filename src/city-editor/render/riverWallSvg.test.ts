import { expect, it } from "vitest";
import type { CityDocument, Point } from "../core/types";
import { renderRiverWallSvg } from "./riverWallSvg";

function crossing(wallPoints: Point[]): CityDocument {
  const mid = Math.floor(wallPoints.length / 2);
  const ids = wallPoints.map((_, i) => `w${i}`);
  const vertices = Object.fromEntries(wallPoints.map((point, i) => [ids[i], { id: ids[i], point, locked: false }]));
  vertices.up = { id: "up", point: [0, 60], locked: false };
  vertices.down = { id: "down", point: [0, -60], locked: false };
  const edges = Object.fromEntries(
    ids.slice(1).map((b, i) => [`e${i}`, { id: `e${i}`, a: ids[i], b, leftFace: null, rightFace: null, locked: false }])
  );
  edges.up = { id: "up", a: "up", b: ids[mid], leftFace: null, rightFace: null, locked: false };
  edges.down = { id: "down", a: ids[mid], b: "down", leftFace: null, rightFace: null, locked: false };
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 200, cityRadiusMeters: 60, blockSizeMeters: 20 },
    mesh: { vertices, edges, faces: {} },
    gates: [],
    elements: [],
    featureGroups: [
      {
        id: "wall",
        kind: "wall",
        style: { widthMeters: 7 },
        segments: ids.slice(1).map((_, i) => ({ edgeId: `e${i}`, forward: true })),
        riverPassages: [ids[mid]]
      },
      { id: "river", kind: "river", style: { widthMeters: 10 }, vertices: ["up", ids[mid], "down"] }
    ]
  };
}

function pathPoints(path: Element): Point[] {
  return [...path.getAttribute("d")!.matchAll(/[ML]([^,]+),([^ML]+)/g)].map(m => [Number(m[1]), -Number(m[2]) || 0]);
}

it("replaces the circle and wave with a thin black grate following each bank's wall angle", () => {
  const city = crossing([
    [-40, -20],
    [0, 0],
    [40, 35]
  ]);
  const original = structuredClone(city);
  const layer = renderRiverWallSvg(city);
  expect(layer.querySelector("circle")).toBeNull();
  const paths = layer.querySelectorAll("path");
  expect(paths).toHaveLength(1);
  const points = pathPoints(paths[0]);
  expect(points[0][0]).toBeCloseTo(-5);
  expect(points[0][1]).toBeCloseTo(-2.5);
  expect(points[1]).toEqual([0, 0]);
  expect(points[2][0]).toBeCloseTo(5);
  expect(points[2][1]).toBeCloseTo(4.375);
  expect(paths[0].getAttribute("stroke")).toBe("#000");
  expect(paths[0].getAttribute("stroke-dasharray")).toBe("1 2");
  expect(Number(paths[0].getAttribute("stroke-width"))).toBeLessThan(2);
  expect(city).toEqual(original);
});

it("continues across short underwater wall edges until both visible banks", () => {
  const city = crossing([
    [-40, -20],
    [-3, -1],
    [0, 0],
    [3, 1],
    [40, 20]
  ]);
  const points = pathPoints(renderRiverWallSvg(city).querySelector("path")!);
  expect(points).toHaveLength(5);
  expect(points[0][0]).toBeCloseTo(-5);
  expect(points.at(-1)![0]).toBeCloseTo(5);
  expect(points.slice(1, -1)).toEqual([
    [-3, -1],
    [0, 0],
    [3, 1]
  ]);
});

it("omits stale passages when the river no longer crosses the wall", () => {
  const city = crossing([
    [-40, -20],
    [0, 0],
    [40, 35]
  ]);
  city.mesh.vertices.down.point = [10, 60];
  expect(renderRiverWallSvg(city).querySelector(".ce-water-passage")).toBeNull();
});

it("wraps both arms when a passage is the seam of a closed curtain", () => {
  const city = crossing([
    [-40, -20],
    [0, 0],
    [40, 35]
  ]);
  city.mesh.edges.close = { id: "close", a: "w2", b: "w0", leftFace: null, rightFace: null, locked: false };
  const wall = city.featureGroups[0];
  if (wall.kind !== "wall") throw new Error("expected wall");
  wall.segments = [
    { edgeId: "e1", forward: true },
    { edgeId: "close", forward: true },
    { edgeId: "e0", forward: true }
  ];
  const points = pathPoints(renderRiverWallSvg(city).querySelector("path")!);
  expect(points[0][0]).toBeCloseTo(-5);
  expect(points.at(-1)![0]).toBeCloseTo(5);
});
