import { describe, expect, it } from "vitest";
import { createSizedDocument } from "./document";
import type { Point } from "./types";
import { lineHitsDocumentWater } from "./waterGeometry";

function dryDocument() {
  const doc = createSizedDocument("micro");
  doc.frame.extentMeters = 200;
  doc.importedFixedCrossings = {
    schemaVersion: 3,
    coordinateUnit: "metres",
    revision: 0,
    originMeters: [0, 0],
    roadWidthMeters: 4,
    requiredBounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
    coverageBounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
    rivers: [],
    crossings: []
  };
  return doc;
}
describe("surveyed water at the city frame", () => {
  it.each<Point>([
    [100, 0],
    [-100, 0],
    [0, 100],
    [0, -100],
    [100, 100]
  ])("clips only the external stroke cap at %s", (x, y) => {
    const doc = dryDocument();
    const line: Point[] = [
      [0, 0],
      [x, y]
    ];
    expect(lineHitsDocumentWater(doc, line, 4)).toBe(true);
    expect(lineHitsDocumentWater(doc, line, 4, true)).toBe(false);
  });
  it("does not use an unmeasured exterior detour", () => {
    expect(
      lineHitsDocumentWater(
        dryDocument(),
        [
          [0, 0],
          [101, 0]
        ],
        4,
        true
      )
    ).toBe(true);
  });
  it("keeps channels reserved even with an empty surveyed river set", () => {
    const doc = dryDocument();
    doc.waterAreas = [
      {
        kind: "river",
        polygon: [
          [98, -10],
          [100, -10],
          [100, 10],
          [98, 10]
        ]
      }
    ];
    expect(
      lineHitsDocumentWater(
        doc,
        [
          [0, 0],
          [100, 0]
        ],
        4,
        true
      )
    ).toBe(true);
  });
  it("rejects incomplete coverage and invalid survey data", () => {
    const doc = dryDocument();
    doc.importedFixedCrossings!.coverageBounds!.maxX = 99;
    expect(() =>
      lineHitsDocumentWater(
        doc,
        [
          [0, 0],
          [90, 0]
        ],
        4,
        true
      )
    ).toThrow("coverage");
    doc.importedFixedCrossings!.roadWidthMeters = -1;
    expect(() =>
      lineHitsDocumentWater(
        doc,
        [
          [0, 0],
          [90, 0]
        ],
        4,
        true
      )
    ).toThrow("Invalid");
  });
});
