import { describe, expect, it } from "vitest";
import { frameRoadConnectedToTown, frameRoadTownConnection } from "./frameRoadConnection";
import type { CityDocument, Point } from "./types";

function city(): CityDocument {
  return {
    frame: { extentMeters: 1000, settlementExtentMeters: 300, cityRadiusMeters: 90, blockSizeMeters: 30 },
    mesh: { vertices: { a: { point: [0, 0] }, b: { point: [40, 0] } }, edges: { e: { a: "a", b: "b" } } },
    featureGroups: [
      {
        id: "road",
        kind: "road",
        sourceRoad: { index: 0, routeId: 1 },
        style: { widthMeters: 3 },
        segments: [{ edgeId: "e", forward: true }]
      }
    ]
  } as unknown as CityDocument;
}
const leg = (paths: Point[][]): NonNullable<CityDocument["frameRoads"]>[number] => ({
  sourceIndex: 0,
  routeId: 1,
  pieces: paths.map(points => ({ kind: "road", points }))
});
describe("frame road continuity", () => {
  it("connects a short exact endpoint and the continuous outer road to the source street", () => {
    const doc = city(),
      road = leg([
        [[50, 0]],
        [
          [50, 0],
          [500, 0]
        ]
      ]);
    expect(frameRoadTownConnection(doc, road)).toEqual([
      [40, 0],
      [50, 0]
    ]);
    expect(frameRoadConnectedToTown(doc, road)).toBe(true);
  });
  it("does not count a detached far-bank tail as reaching the edge from town", () => {
    expect(
      frameRoadConnectedToTown(
        city(),
        leg([
          [
            [40, 0],
            [100, 0]
          ],
          [
            [200, 0],
            [500, 0]
          ]
        ])
      )
    ).toBe(false);
  });
  it("checks the width of the connector against water, even with a dry centerline", () => {
    const doc = city();
    doc.waterAreas = [
      {
        kind: "river",
        polygon: [
          [44, 0.1],
          [48, 0.1],
          [48, 10],
          [44, 10]
        ]
      }
    ];
    expect(
      frameRoadTownConnection(
        doc,
        leg([
          [
            [50, 0],
            [500, 0]
          ]
        ])
      )
    ).toBeNull();
  });
  it("rejects an outer road that crosses another water body", () => {
    const doc = city();
    doc.waterAreas = [
      {
        kind: "river",
        polygon: [
          [60, -10],
          [80, -10],
          [80, 10],
          [60, 10]
        ]
      }
    ];
    expect(
      frameRoadConnectedToTown(
        doc,
        leg([
          [
            [40, 0],
            [500, 0]
          ]
        ])
      )
    ).toBe(false);
  });
});
