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

  it("opens dry shoreline arcs at an estuary while keeping transverse landward curtains", () => {
    const source = curtain();
    source.waterAreas = [];
    source.importedFixedCrossings!.rivers = [
      {
        ...structuredClone(input.descriptor.fixedCrossings.rivers[0]),
        rings: [
          [
            [110, -100],
            [150, -100],
            [150, 200],
            [110, 200]
          ]
        ]
      }
    ];
    expect(clipSurveyedRiverWalls(source).featureGroups[0]).toEqual(source.featureGroups[0]);
    const opened = clipSurveyedRiverWalls(source, true);
    expect(validate(opened)).toEqual([]);
    const segments = opened.featureGroups.flatMap(g => (g.kind === "wall" ? g.segments : []));
    expect(segments).toHaveLength(3);
    for (const ref of segments) {
      const edge = opened.mesh.edges[ref.edgeId];
      expect([edge.a, edge.b].every(id => opened.mesh.vertices[id].point[0] === 100)).toBe(false);
    }
    expect(clipSurveyedRiverWalls(opened, true)).toEqual(opened);
  });

  it("extends an open generated curtain to an imported river area on both sides", () => {
    const source = curtain();
    source.importedFixedCrossings = undefined;
    const wall = source.featureGroups[0];
    if (wall.kind !== "wall") throw new Error("Missing wall");
    wall.segments = [wall.segments[3]];
    const result = clipSurveyedRiverWalls(source);
    expect(validate(result)).toEqual([]);
    const lines = result.featureGroups.flatMap(g =>
      g.kind === "wall"
        ? g.segments.map(ref => {
            const edge = result.mesh.edges[ref.edgeId];
            return [result.mesh.vertices[edge.a].point, result.mesh.vertices[edge.b].point];
          })
        : []
    );
    expect(lines).toHaveLength(3);
    expect(lines.flat().filter(point => Math.abs(point[0] - 40) < 1e-6)).toHaveLength(2);
    for (const line of lines) expect(lineHitsWater(line, waterPolygons(result))).toBe(false);
    expect(clipSurveyedRiverWalls(result)).toEqual(result);
  });

  it.each([false, true])("removes only unlocked detached bank remnants (locked: %s)", locked => {
    const source = curtain();
    source.waterAreas = [];
    source.importedFixedCrossings!.rivers = [
      {
        ...structuredClone(input.descriptor.fixedCrossings.rivers[0]),
        rings: [
          [
            [0, 0],
            [50, -1],
            [100, 0],
            [100, -100],
            [0, -100]
          ]
        ]
      }
    ];
    const wall = source.featureGroups[0];
    source.featureGroups = [
      { ...wall, segments: [wall.segments[0]], locked },
      { ...wall, id: "gc:wall-1", segments: [wall.segments[2]] }
    ];
    const result = clipSurveyedRiverWalls(source);
    expect(result.featureGroups.some(g => g.id === "gc:wall-0")).toBe(locked);
    expect(result.featureGroups.some(g => g.id === "gc:wall-1")).toBe(true);
    expect(validate(result)).toEqual([]);
    expect(clipSurveyedRiverWalls(result)).toEqual(result);
    // Without another landward curtain, retain the only wall.
    source.featureGroups = [{ ...wall, segments: [wall.segments[0]] }];
    expect(clipSurveyedRiverWalls(source).featureGroups).toHaveLength(1);
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
