import { describe, expect, it } from "vitest";
import type { CityDocument } from "../types/document";
import type { WardKind } from "../types/primitives";
import { cellRelief } from "./cellRelief";
import { meshFromCells } from "./mesh";
import { cityTerrain } from "./terrainElevation";

function pair(
  leftWard: WardKind | null,
  rightWard: WardKind | null,
  leftElevation: number,
  rightElevation: number,
  occupySharedEdge: "road" | "wall" | null = null
): CityDocument {
  const mesh = meshFromCells([
    {
      id: 0,
      polygon: [
        [0, 0],
        [100, 0],
        [100, 80],
        [0, 80]
      ],
      site: [50, 40],
      centroid: [50, 40],
      neighbors: [],
      onBorder: true
    },
    {
      id: 1,
      polygon: [
        [100, 0],
        [200, 0],
        [200, 80],
        [100, 80]
      ],
      site: [150, 40],
      centroid: [150, 40],
      neighbors: [],
      onBorder: true
    }
  ]);
  mesh.faces.f0.properties.ward = leftWard;
  mesh.faces.f0.properties.elevation = leftElevation;
  mesh.faces.f1.properties.ward = rightWard;
  mesh.faces.f1.properties.elevation = rightElevation;
  const shared = Object.values(mesh.edges).find(edge => edge.leftFace && edge.rightFace)!;
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 400, cityRadiusMeters: 100, blockSizeMeters: 50 },
    mesh,
    featureGroups: occupySharedEdge
      ? [
          {
            id: "edge",
            kind: occupySharedEdge,
            name: "Edge",
            locked: false,
            segments: [{ edgeId: shared.id, forward: true }],
            style: { widthMeters: 4, color: "#000" }
          }
        ]
      : [],
    gates: [],
    elements: []
  } as CityDocument;
}

describe("empty cell slopes", () => {
  it("spreads a large gap between empty cells into a slope with no wall", () => {
    const document = pair(null, "empty", 1, 50);
    const relief = cellRelief(document);
    expect(relief.steps).toHaveLength(0);
    expect(relief.walled).toBe(false);
    // Datum is the lower cell. Centres keep their own elevations.
    expect(relief.heightAt([50, 40])).toBeCloseTo(0, 5);
    expect(relief.heightAt([150, 40])).toBeCloseTo(49, 5);
    // The shared edge sits halfway, and the ground rises steadily toward it.
    expect(relief.heightAt([100, 40])).toBeCloseTo(24.5, 1);
    expect(relief.heightAt([75, 40])).toBeCloseTo(12.25, 4);
    expect(relief.heightAt([125, 40])).toBeCloseTo(36.75, 4);
    const terrain = cityTerrain(document);
    expect(terrain.triangles.some(patch => patch.escarpment)).toBe(false);
  });

  it("meets a level cell at that cell's elevation and leaves the level cell flat", () => {
    const document = pair("craftsmen", null, 40, 2);
    const relief = cellRelief(document);
    expect(relief.steps).toHaveLength(0);
    expect(relief.heightAt([50, 40])).toBeCloseTo(38, 5);
    expect(relief.heightAt([80, 40])).toBeCloseTo(38, 5);
    expect(relief.heightAt([100, 40])).toBeCloseTo(38, 1);
    expect(relief.heightAt([150, 40])).toBeCloseTo(0, 5);
    expect(relief.heightAt([125, 40])).toBeCloseTo(19, 4);
    expect(relief.onWall("f0", [99.9, 40])).toBe(false);
  });

  it("keeps a bank or a wall between two occupied cells", () => {
    const gentle = cellRelief(pair("craftsmen", "market", 1, 3));
    expect(gentle.steps.map(step => step.kind)).toEqual(["bank"]);
    expect(gentle.heightAt([50, 40])).toBeCloseTo(0, 5);
    expect(gentle.heightAt([150, 40])).toBeCloseTo(2, 5);
    const steep = cellRelief(pair("craftsmen", "market", 1, 40));
    expect(steep.steps.map(step => step.kind)).toEqual(["wall"]);
    expect(steep.walled).toBe(true);
    expect(steep.heightAt([50, 40])).toBeCloseTo(0, 5);
    expect(steep.heightAt([110, 40])).toBeCloseTo(39, 5);
    expect(steep.onWall("f1", [100.1, 40])).toBe(true);
  });

  it("keeps a cell level when a road or an element occupies it", () => {
    const road = cellRelief(pair(null, "empty", 1, 40, "road"));
    expect(road.steps.map(step => step.kind)).toEqual(["wall"]);
    const document = pair(null, "empty", 1, 40);
    document.elements.push({
      id: "plaza",
      kind: "plaza",
      faceIds: ["f0"],
      locked: false
    });
    const relief = cellRelief(document);
    expect(relief.steps).toHaveLength(0);
    expect(relief.heightAt([50, 40])).toBeCloseTo(0, 5);
    expect(relief.heightAt([80, 40])).toBeCloseTo(0, 5);
    expect(relief.heightAt([150, 40])).toBeCloseTo(39, 5);
    expect(relief.heightAt([125, 40])).toBeCloseTo(19.5, 4);
  });
});
