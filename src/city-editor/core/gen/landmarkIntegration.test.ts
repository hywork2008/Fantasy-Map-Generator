import { describe, expect, it } from "vitest";
import { createDocument } from "../document";
import { polygonIntersectsLandmark } from "../landmarks";
import { meshFromCells } from "../mesh";
import type { CityDocument, LandmarkPolygon, Point } from "../types";
import { type BuildingLot, buildCityBuildings } from "./buildingLots";
import { rebuildLandmarkHousing } from "./landmarkIntegration";

const rectangle = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1]
];

function fixture(site: LandmarkPolygon): CityDocument {
  const polygon = rectangle(0, 0, 60, 40);
  const mesh = meshFromCells([{ id: 0, polygon, site: [30, 20], centroid: [30, 20], neighbors: [], onBorder: false }]);
  const roadEdge = Object.values(mesh.edges).find(
    edge => mesh.vertices[edge.a].point[0] === 0 && mesh.vertices[edge.b].point[0] === 0
  )!;
  return {
    format: "fmg-city-editor",
    version: 3,
    mesh,
    frame: { extentMeters: 100, cityRadiusMeters: 35, blockSizeMeters: 50 },
    featureGroups: [
      {
        id: "road",
        kind: "road",
        name: "Road",
        segments: [{ edgeId: roadEdge.id, forward: true }],
        style: { widthMeters: 4, color: "#555" },
        locked: false
      }
    ],
    gates: [],
    elements: [],
    landmarks: [
      {
        id: "site",
        assetId: "test",
        assetRevision: "1",
        position: [0, 0],
        rotation: 0,
        scale: 1,
        site: [site],
        accesses: [],
        locked: false
      }
    ]
  };
}

const near: BuildingLot = { faceId: "f0", id: "near", polygon: rectangle(5, 5, 15, 15), landmark: false };
const far: BuildingLot = { faceId: "f0", id: "far", polygon: rectangle(30, 5, 40, 15), landmark: false };

describe("landmark residential residuals", () => {
  it("applies the same reservation to the legacy building generator", () => {
    const document = createDocument("legacy-landmark", 300);
    for (const face of Object.values(document.mesh.faces)) {
      face.properties.ward = "craftsmen";
      face.properties.buildable = true;
      face.properties.settlement = "core";
    }
    const original = buildCityBuildings(document);
    expect(original.length).toBeGreaterThan(0);
    const site = { outer: original[0].polygon, holes: [] };
    const reserved: CityDocument = {
      ...document,
      version: 3,
      landmarks: [
        {
          id: "site",
          assetId: "test",
          assetRevision: "1",
          position: [0, 0],
          rotation: 0,
          scale: 1,
          site: [site],
          accesses: [],
          locked: false
        }
      ]
    };
    const changed = buildCityBuildings(reserved);
    expect(changed.every(building => !polygonIntersectsLandmark(building.polygon, [site]))).toBe(true);
  });
  it("replaces an intersecting house with one whole street-fronting house and preserves unrelated houses", () => {
    const site = { outer: rectangle(11, 2, 19, 18), holes: [] };
    const result = rebuildLandmarkHousing(fixture(site), [near, far]);
    expect(result).toHaveLength(2);
    expect(result[1]).toBe(far);
    expect(result[0].id).toBe("near:landmark-rebuilt");
    expect(result[0].polygon).not.toEqual(near.polygon);
    expect(polygonIntersectsLandmark(result[0].polygon, [site])).toBe(false);
  });

  it("does not put a new house on a residual strip without street frontage", () => {
    const result = rebuildLandmarkHousing(fixture({ outer: rectangle(3, 2, 9, 18), holes: [] }), [near, far]);
    expect(result).toEqual([far]);
  });

  it("keeps a house in a landmark courtyard hole", () => {
    const site = { outer: rectangle(1, 1, 20, 20), holes: [rectangle(4, 4, 16, 16)] };
    const result = rebuildLandmarkHousing(fixture(site), [near]);
    expect(result).toEqual([near]);
  });
});
