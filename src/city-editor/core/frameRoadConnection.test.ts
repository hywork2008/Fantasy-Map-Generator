import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import { createGridDocument, descriptorFrameGridOptions } from "./document";
import { featureGroupVertices } from "./features";
import tives from "./fixtures/tives-boundary-roads-20261005.json";
import tob from "./fixtures/tobogobo-boundary-roads-20261005.json";
import { frameRoadConnectedToTown, frameRoadTownConnection } from "./frameRoadConnection";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";
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

describe("straight core/exterior road joins", () => {
  it.each([tob, tives])("shares a collinear endpoint for every supplied regional road", payload => {
    const share = parseIncomingPayload(JSON.stringify(payload))!;
    const input = createGridDocument({
      size: share.size,
      grid: share.grid,
      seed: share.gridSeed ?? share.seed,
      patchParams: share.patchParams,
      measureBlockSize: share.measureBlockSize,
      ...descriptorFrameGridOptions(share.descriptor!.frame)
    });
    const doc = generateCityOnDocument(
      input,
      { ...defaultGenerationSettings(), buildingPattern: "legacy", ...share.settings, descriptor: share.descriptor },
      share.seed,
      () => {}
    )!;
    expect(doc.frameRoads).toHaveLength(3);
    for (const leg of doc.frameRoads!) {
      const [join, outward] = leg.pieces[0].points;
      const road = doc.featureGroups.find(g => g.kind === "road" && g.sourceRoad?.index === leg.sourceIndex)!;
      const points = featureGroupVertices(doc, road).map(id => doc.mesh.vertices[id].point);
      if (points.at(-1) === join) points.reverse();
      expect(points[0]).toBe(join);
      const inner = points[1];
      const cross = (join[0] - inner[0]) * (outward[1] - join[1]) - (join[1] - inner[1]) * (outward[0] - join[0]);
      expect(Math.abs(cross)).toBeLessThan(1e-7);
      expect(frameRoadTownConnection(doc, leg)).toEqual([join, join]);
      expect(frameRoadConnectedToTown(doc, leg)).toBe(true);
      expect(leg.pieces.slice(1)).toEqual([]);
    }
  });
});
