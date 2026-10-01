import { describe, expect, it } from "vitest";
import { createDocument, parseDocument } from "./document";
import { DocumentHistory } from "./history";
import {
  landmarkReservationHits,
  placeLandmark,
  polygonIntersectsLandmark,
  transformLandmarkPolygons
} from "./landmarks";
import type { LandmarkAsset, Point } from "./types";

const square = (half: number): Point[] => [
  [-half, -half],
  [half, -half],
  [half, half],
  [-half, half]
];
const asset: LandmarkAsset = {
  id: "test-plan",
  revision: "1",
  name: "Test plan",
  historicalPhase: "test",
  referenceSizeMeters: [20, 20],
  dimensionSource: "test",
  provenanceId: "test",
  footprint: [{ outer: square(8), holes: [] }],
  minimumSite: [{ outer: square(10), holes: [] }],
  entrances: [],
  renderSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 0L1 1Z"/></svg>'
};

describe("historic landmark foundation", () => {
  it("transforms site geometry without changing the source", () => {
    const transformed = transformLandmarkPolygons(asset.minimumSite, {
      position: [20, 30],
      rotation: Math.PI / 2,
      scale: 2
    });
    expect(transformed[0].outer[0][0]).toBeCloseTo(40);
    expect(transformed[0].outer[0][1]).toBeCloseTo(10);
    expect(asset.minimumSite[0].outer[0]).toEqual([-10, -10]);
  });

  it("respects courtyard holes when reserving housing", () => {
    const site = [{ outer: square(10), holes: [square(4)] }];
    expect(polygonIntersectsLandmark(square(2), site)).toBe(false);
    expect(
      polygonIntersectsLandmark(
        [
          [6, 0],
          [8, 0],
          [8, 2],
          [6, 2]
        ],
        site
      )
    ).toBe(true);
  });

  it("saves and replays a placement as one history edit", () => {
    const doc = createDocument("landmark-test", 300);
    const result = placeLandmark(doc, asset, { id: "landmark-1", position: [0, 0], rotation: 0, scale: 1 });
    expect(result.reasons).toEqual([]);
    expect(result.document).not.toBeNull();
    const next = result.document!;
    expect(landmarkReservationHits(next, square(2))).toBe(true);
    expect(parseDocument(JSON.stringify(next))?.landmarks?.[0].id).toBe("landmark-1");
    const history = new DocumentHistory(doc);
    history.commit(next, "Place landmark");
    expect(history.undo()?.landmarks).toBeUndefined();
    expect(history.redo()?.landmarks?.[0].id).toBe("landmark-1");
  });

  it("rejects unsafe SVG and an out-of-frame site", () => {
    const doc = createDocument("landmark-test", 300);
    const unsafe = { ...asset, renderSvg: "<svg><script>alert(1)</script></svg>" };
    expect(placeLandmark(doc, unsafe, { id: "unsafe", position: [0, 0], rotation: 0, scale: 1 }).document).toBeNull();
    const outside = placeLandmark(doc, asset, { id: "outside", position: [149, 0], rotation: 0, scale: 1 });
    expect(outside.document).toBeNull();
    expect(outside.reasons).toContain("Outside map frame");
  });
});
