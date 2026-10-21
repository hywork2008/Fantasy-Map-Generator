import { describe, expect, it, vi } from "vitest";
import type { CityDocument, Point } from "../types/document";
import { farmSheds } from "./farmSheds";
import { pointInPolygon } from "./geom";
import type { FarmPlot } from "./localInfill";
import { meshFromCells } from "./mesh";
import { NearbyPolylineIndex } from "./nearbyPolylineIndex";

describe("farm sheds", () => {
  it("places a sparse shed inside a roadside field and keeps it off the road", () => {
    const polygon: Point[] = [
      [0, 0],
      [360, 0],
      [360, 90],
      [0, 90]
    ];
    const mesh = meshFromCells([
      { id: 0, polygon, site: [180, 45], centroid: [180, 45], neighbors: [], onBorder: false }
    ]);
    const roadEdge = Object.values(mesh.edges).find(
      edge => mesh.vertices[edge.a].point[1] === 0 && mesh.vertices[edge.b].point[1] === 0
    )!;
    const document: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      gridKind: "evolution",
      frame: { extentMeters: 400, cityRadiusMeters: 100, blockSizeMeters: 50 },
      mesh,
      featureGroups: [
        {
          id: "road",
          kind: "road",
          name: "Road",
          segments: [{ edgeId: roadEdge.id, forward: true }],
          style: { widthMeters: 6, color: "brown" },
          locked: false
        }
      ],
      gates: [],
      elements: []
    };
    const farms: FarmPlot[] = Array.from({ length: 10 }, (_, index) => ({
      faceId: "f0",
      polygon: [
        [index * 36 + 3, 7],
        [index * 36 + 33, 7],
        [index * 36 + 33, 67],
        [index * 36 + 3, 67]
      ],
      rows: []
    }));
    const sheds = farmSheds(document, farms, []);
    const query = NearbyPolylineIndex.prototype.query;
    const spy = vi.spyOn(NearbyPolylineIndex.prototype, "query").mockImplementation(function (point) {
      return query.call(this, point, Infinity);
    });
    try {
      expect(farmSheds(document, farms, [])).toEqual(sheds);
    } finally {
      spy.mockRestore();
    }
    expect(sheds).toHaveLength(1);
    expect(
      sheds[0].polygon.every(point => farms.some(farm => pointInPolygon(point, farm.polygon)) && point[1] > 5)
    ).toBe(true);
    expect(farmSheds({ ...document, featureGroups: [] }, farms, [])).toHaveLength(0);
    const distant = farms.map(farm => ({ ...farm, polygon: farm.polygon.map(([x, y]): Point => [x, y + 300]) }));
    expect(farmSheds(document, distant, [])).toHaveLength(0);
    expect(
      farmSheds(
        document,
        distant,
        [],
        [
          {
            faceId: "f0",
            points: [
              [0, 300],
              [360, 300]
            ],
            widthMeters: 4,
            kind: "farm-track"
          }
        ]
      )
    ).toHaveLength(1);
  });
});
