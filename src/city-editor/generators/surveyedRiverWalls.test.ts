import { describe, expect, it } from "vitest";
import input from "../data/fixtures/gothengsfeld-20261012.json";
import type { CityDocument } from "../types/document";
import { createGridDocument } from "./document";
import { polylineLength } from "./geom";
import { meshFromCells, validate } from "./mesh";
import { clipSurveyedRiverWalls } from "./surveyedRiverWalls";
import { lineHitsWater, waterPolygons } from "./waterGeometry";

function curtain(): CityDocument {
  const document = createGridDocument({ size: "tiny", grid: "hex", seed: "bank-cut" });
  document.mesh = meshFromCells([
    {
      id: 0,
      polygon: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100]
      ],
      centroid: [50, 50],
      site: [50, 50],
      neighbors: []
    }
  ]);
  document.importedFixedCrossings = {
    ...structuredClone(input.descriptor.fixedCrossings),
    rivers: []
  } as CityDocument["importedFixedCrossings"];
  document.waterAreas = [
    {
      kind: "river",
      polygon: [
        [40, -100],
        [60, -100],
        [60, 200],
        [40, 200]
      ]
    }
  ];
  document.featureGroups = [
    {
      id: "gc:wall-0",
      kind: "wall",
      name: "Curtain",
      segments: document.mesh.faces.f0.boundary,
      style: { widthMeters: 4, color: "black" },
      locked: false
    }
  ];
  return document;
}

describe("surveyed river wall cuts", () => {
  it("retains both dry banks and shares inserted vertices with the original cells", () => {
    const source = curtain();
    const before = structuredClone(source);
    const result = clipSurveyedRiverWalls(source);
    expect(source).toEqual(before);
    expect(validate(result)).toEqual([]);
    expect(Object.keys(result.mesh.vertices)).toHaveLength(8);
    expect(result.mesh.faces.f0.boundary).toHaveLength(8);
    const lines = result.featureGroups.flatMap(g =>
      g.kind === "wall"
        ? g.segments.map(ref => {
            const edge = result.mesh.edges[ref.edgeId];
            return [result.mesh.vertices[edge.a].point, result.mesh.vertices[edge.b].point];
          })
        : []
    );
    expect(lines.reduce((sum, line) => sum + polylineLength(line), 0)).toBeCloseTo(360);
    for (const line of lines) expect(lineHitsWater(line, waterPolygons(result))).toBe(false);
    expect(clipSurveyedRiverWalls(result)).toEqual(result);
  });

  it("preserves locked and manually drawn curtains", () => {
    const locked = curtain();
    locked.featureGroups[0].locked = true;
    expect(clipSurveyedRiverWalls(locked)).toEqual(locked);
    const manual = curtain();
    manual.featureGroups[0].id = "wall-manual";
    expect(clipSurveyedRiverWalls(manual)).toEqual(manual);
  });
});
