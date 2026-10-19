import { expect, it } from "vitest";
import type { CityDocument, Point } from "../types/document";
import { removeRedundantRoadDetours } from "./redundantRoadDetours";

function fixture(gap = 10): CityDocument {
  const points: Point[] = [
    [0, 0],
    [50, 0],
    [100, 0],
    [25, gap],
    [75, gap],
    [50, 30]
  ];
  const pairs = [
    [0, 1],
    [1, 2],
    [0, 3],
    [3, 4],
    [4, 2],
    [4, 5]
  ];
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 400, cityRadiusMeters: 120, blockSizeMeters: 50 },
    mesh: {
      vertices: Object.fromEntries(points.map((point, i) => [`v${i}`, { id: `v${i}`, point, locked: false }])),
      edges: Object.fromEntries(
        pairs.map(([a, b], i) => [`e${i}`, { id: `e${i}`, a: `v${a}`, b: `v${b}`, locked: false }])
      ),
      faces: {}
    },
    gates: [],
    elements: [],
    featureGroups: [
      {
        id: "gc:road-5",
        kind: "road",
        name: "Main",
        locked: false,
        style: { widthMeters: 4.5 },
        segments: [0, 1].map(i => ({ edgeId: `e${i}`, forward: true }))
      },
      {
        id: "gc:road-8",
        kind: "road",
        name: "Bypass",
        locked: false,
        style: { widthMeters: 4.5 },
        segments: [2, 3, 4].map(i => ({ edgeId: `e${i}`, forward: true }))
      }
    ]
  } as CityDocument;
}

it("removes a close bypass while retaining its trunk and leaving the input unchanged", () => {
  const source = fixture();
  const before = JSON.stringify(source);
  const result = removeRedundantRoadDetours(source);
  expect(result.featureGroups.map(g => g.id)).toEqual(["gc:road-5"]);
  expect(JSON.stringify(source)).toBe(before);
  expect(removeRedundantRoadDetours(result)).toBe(result);
});

it("retains ordinary blocks, wider roads, protected roads and intermediate connections", () => {
  const wideBlock = fixture(40);
  expect(removeRedundantRoadDetours(wideBlock)).toBe(wideBlock);
  const widerRoad = fixture();
  widerRoad.featureGroups[1].style.widthMeters = 8;
  expect(removeRedundantRoadDetours(widerRoad)).toBe(widerRoad);
  const fixed = fixture();
  fixed.featureGroups[1].locked = true;
  expect(removeRedundantRoadDetours(fixed)).toBe(fixed);
  const approach = fixture();
  const approachRoad = approach.featureGroups[1];
  if (approachRoad.kind === "road") approachRoad.roadRole = "approach";
  expect(removeRedundantRoadDetours(approach)).toBe(approach);
  const preserved = fixture();
  expect(removeRedundantRoadDetours(preserved, new Set(["gc:road-8"]))).toBe(preserved);
  const branch = fixture();
  branch.featureGroups.push({
    ...branch.featureGroups[1],
    id: "gc:road-9",
    segments: [{ edgeId: "e5", forward: true }]
  });
  expect(removeRedundantRoadDetours(branch)).toBe(branch);
});

it("keeps a short access spur for a junction near the start of a bypass", () => {
  const city = fixture();
  city.mesh.vertices.v3.point = [10, 5];
  city.mesh.edges.e5.a = "v3";
  city.featureGroups.push({ ...city.featureGroups[1], id: "gc:road-9", segments: [{ edgeId: "e5", forward: true }] });
  const result = removeRedundantRoadDetours(city);
  const road8 = result.featureGroups.find(g => g.id === "gc:road-8")!;
  expect(road8.kind === "road" && road8.segments.map(r => r.edgeId)).toEqual(["e2"]);
  expect(result.featureGroups.some(g => g.id === "gc:road-9")).toBe(true);
});

it("detects a bypass split across oppositely oriented road groups", () => {
  const source = fixture();
  const bypass = source.featureGroups[1];
  if (bypass.kind !== "road") throw new Error("Expected a road");
  source.featureGroups[1] = { ...bypass, segments: [bypass.segments[0]] };
  source.featureGroups.push({
    ...bypass,
    id: "gc:road-10",
    segments: bypass.segments
      .slice(1)
      .reverse()
      .map(r => ({ ...r, forward: !r.forward }))
  });
  const before = JSON.stringify(source);
  const result = removeRedundantRoadDetours(source);
  expect(result.featureGroups.map(g => g.id)).toEqual(["gc:road-5"]);
  expect(JSON.stringify(source)).toBe(before);
  expect(removeRedundantRoadDetours(result)).toBe(result);
});
