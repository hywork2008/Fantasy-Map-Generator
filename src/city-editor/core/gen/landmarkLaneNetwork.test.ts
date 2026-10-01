import { describe, expect, it } from "vitest";
import { meshFromCells } from "../mesh";
import type { CityDocument, Point } from "../types";
import {
  buildLandmarkLaneNetwork,
  landmarkLaneId,
  repairLandmarkLaneTargets,
  resolveLandmarkLaneTarget
} from "./landmarkLaneNetwork";

const boundary: Point[] = [
  [-50, -50],
  [50, -50],
  [50, 50],
  [-50, 50]
];
const mesh = meshFromCells([
  { id: 0, polygon: boundary, site: [0, 0], centroid: [0, 0], neighbors: [], onBorder: true }
]);
const edge = Object.values(mesh.edges).find(
  candidate => mesh.vertices[candidate.a].point[0] === -50 && mesh.vertices[candidate.b].point[0] === -50
)!;
const document: CityDocument = {
  format: "fmg-city-editor",
  version: 1,
  mesh,
  frame: { extentMeters: 100, cityRadiusMeters: 30, blockSizeMeters: 50 },
  featureGroups: [
    {
      id: "public-road",
      kind: "road",
      name: "Road",
      segments: [{ edgeId: edge.id, forward: true }],
      style: { widthMeters: 4, color: "#555" },
      locked: false
    }
  ],
  gates: [],
  elements: []
};
const lanes = [
  {
    faceId: "f0",
    points: [
      [-48, 0],
      [-30, 0]
    ] as Point[],
    widthMeters: 2
  },
  {
    faceId: "f0",
    points: [
      [-30, 0],
      [-10, 0]
    ] as Point[],
    widthMeters: 2
  },
  {
    faceId: "f0",
    points: [
      [10, 10],
      [20, 10]
    ] as Point[],
    widthMeters: 2
  }
];

describe("generated lane target network", () => {
  it("gives direction-independent stable IDs and connects only the road-rooted component", () => {
    expect(landmarkLaneId(lanes[0])).toBe(landmarkLaneId({ ...lanes[0], points: [...lanes[0].points].reverse() }));
    const network = buildLandmarkLaneNetwork(document, lanes);
    expect(network.map(lane => lane.connectedToRoad)).toEqual([true, true, false]);
    expect(resolveLandmarkLaneTarget("old-id", [-15, 0], network)?.id).toBe(network[1].id);
    expect(resolveLandmarkLaneTarget(network[2].id, [15, 10], network)).toBeNull();
  });
  it("repairs a regenerated target near its saved point and preserves an unresolved corridor", () => {
    const network = buildLandmarkLaneNetwork(document, lanes);
    const withLandmarks: CityDocument = {
      ...document,
      landmarks: [
        {
          id: "landmark",
          assetId: "asset",
          assetRevision: "1",
          position: [0, 0],
          rotation: 0,
          scale: 1,
          site: [],
          locked: false,
          accesses: [
            {
              entranceId: "a",
              points: [
                [-20, 5],
                [-15, 0]
              ],
              widthMeters: 2,
              target: { kind: "lane", id: "old", point: [-15, 0] }
            },
            {
              entranceId: "b",
              points: [
                [30, 30],
                [35, 30]
              ],
              widthMeters: 2,
              target: { kind: "lane", id: "lost", point: [35, 30] }
            }
          ]
        }
      ]
    };
    const result = repairLandmarkLaneTargets(withLandmarks, network);
    expect(result.unresolved).toEqual(["landmark"]);
    expect(result.document.landmarks?.[0].accesses[0].target.id).toBe(network[1].id);
    expect(result.document.landmarks?.[0].accesses[1]).toEqual(withLandmarks.landmarks?.[0].accesses[1]);
  });
});
