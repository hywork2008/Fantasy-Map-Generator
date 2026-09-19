import { describe, expect, it } from "vitest";
import { meshFromCells, validate } from "../mesh";
import type { CityDocument, Point } from "../types";
import { shortcutMajorRoads } from "./majorRoadShortcuts";

function fixture(): CityDocument {
  const polygon: Point[] = [
    [0, 0],
    [200, 0],
    [200, 200],
    [0, 200]
  ];
  const mesh = meshFromCells([
    { id: 0, polygon, centroid: [100, 100], site: [100, 100], neighbors: [], onBorder: false }
  ]);
  return {
    format: "fmg-city-editor",
    version: 1,
    gridKind: "evolution",
    frame: { extentMeters: 1000, cityRadiusMeters: 300, blockSizeMeters: 50 },
    mesh,
    gates: [],
    elements: [],
    featureGroups: [
      {
        id: "gc:road-0",
        kind: "road",
        name: "Approach",
        segments: mesh.faces.f0.boundary.slice(0, 2),
        style: { widthMeters: 8, color: "black" },
        locked: false
      }
    ]
  };
}
describe("major-road diagonals", () => {
  it("cuts a coarse face once to replace a detour while preserving the source", () => {
    const doc = fixture();
    const before = JSON.stringify(doc);
    const result = shortcutMajorRoads(doc);
    expect(Object.keys(result.mesh.faces)).toHaveLength(2);
    const road = result.featureGroups[0];
    expect(road.kind).toBe("road");
    if (road.kind === "road") expect(road.segments).toHaveLength(1);
    expect(validate(result)).toEqual([]);
    expect(JSON.stringify(doc)).toBe(before);
  });
  it("does not split a locked face or remove another road's junction", () => {
    const doc = fixture();
    doc.mesh.faces.f0.properties.locked = true;
    expect(shortcutMajorRoads(doc)).toBe(doc);
    doc.mesh.faces.f0.properties.locked = false;
    doc.featureGroups.push({ ...doc.featureGroups[0], id: "manual-road" });
    expect(shortcutMajorRoads(doc)).toBe(doc);
  });
});
