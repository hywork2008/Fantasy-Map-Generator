import { describe, expect, it } from "vitest";
import input from "../data/fixtures/gothengsfeld-20261012.json";
import { cityEditorSettings } from "../services/analysis/housingReport";
import { parseIncomingPayload } from "../services/io/incomingCity";
import type { CityDocument, Point } from "../types/document";
import { createGridDocument } from "./document";
import { finishCityGeometry } from "./finishCityGeometry";
import { wallRunsOutsideGates } from "./fortifications";
import { segmentSegmentHit } from "./geom";
import { meshFromCells, validate } from "./mesh";
import { gateCrossingFrame, validGeneratedCrossings } from "./passages";
import { installRegionalRoadGates, regionalRoadThroughGate } from "./regionalRoadGates";

function town(
  points: Point[] = [
    [-50, 50],
    [150, 50]
  ]
): CityDocument {
  const document = createGridDocument({ size: "tiny", grid: "hex", seed: "regional-gate" });
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
  document.featureGroups = [
    {
      id: "gc:wall-0",
      kind: "wall",
      name: "Wall",
      segments: document.mesh.faces.f0.boundary,
      locked: false,
      style: { widthMeters: 4, color: "black" }
    }
  ];
  document.frameRoads = [{ sourceIndex: 0, routeId: 10, pieces: [{ kind: "road", points }] }];
  document.gates = [];
  return document;
}

describe("regional highways crossing the curtain", () => {
  it.each([false, true])("clears the rendered large-city highway (cobbled: %s)", paved => {
    const source = town();
    source.frame.extentMeters = 3000;
    if (paved) {
      const value = parseIncomingPayload(JSON.stringify(input))!;
      const settings = cityEditorSettings(value);
      settings.descriptor!.roads = [
        {
          ...settings.descriptor!.roads[0],
          routeId: 10,
          group: "roads",
          traffic: 24,
          trafficRank: 1
        }
      ];
      source.fabric = {
        version: 4,
        seed: "regional-gate",
        districts: [],
        generation: { algorithm: "evolution-city-v3", seed: "regional-gate", settings, input: structuredClone(source) }
      };
    }
    const city = installRegionalRoadGates(source);
    const roadWidth = paved ? 12 : 7.5;
    expect(city.gates).toHaveLength(2);
    for (const gate of city.gates) expect(gate.passageWidthMeters).toBeCloseTo(roadWidth + 2.2);
    // Both edges of the drawn highway must pass through the curtain opening.
    for (const group of city.featureGroups) {
      if (group.kind !== "wall") continue;
      for (const ref of group.segments) {
        const edge = city.mesh.edges[ref.edgeId];
        const line = [city.mesh.vertices[edge.a].point, city.mesh.vertices[edge.b].point];
        for (const run of wallRunsOutsideGates(city, line))
          for (const y of [50 - roadWidth / 2, 50 + roadWidth / 2])
            expect(segmentSegmentHit([-50, y], [150, y], run[0], run[1])).toBeNull();
      }
    }
  });

  it("opens both crossings without turning the highway into mesh road edges", () => {
    const source = town();
    const before = structuredClone(source);
    const city = installRegionalRoadGates(source);
    expect(source).toEqual(before);
    expect(city.frameRoads).toEqual(source.frameRoads);
    expect(city.featureGroups.every(g => g.kind === "wall")).toBe(true);
    expect(city.gates).toHaveLength(2);
    expect(validate(city)).toEqual([]);
    expect(validGeneratedCrossings(city)).toBe(true);
    for (const gate of city.gates) {
      expect(regionalRoadThroughGate(city, gate.vertexId)).toHaveLength(2);
      expect(gateCrossingFrame(city, gate.vertexId)?.roads).toHaveLength(2);
      expect(gate.passageWidthMeters).toBeCloseTo(7.2);
    }
    for (const edge of Object.values(city.mesh.edges)) {
      const run = [city.mesh.vertices[edge.a].point, city.mesh.vertices[edge.b].point];
      for (const dry of wallRunsOutsideGates(city, run))
        expect(segmentSegmentHit([-50, 50], [150, 50], dry[0], dry[1])).toBeNull();
    }
    expect(installRegionalRoadGates(city)).toEqual(city);
    const smoothed = finishCityGeometry(city);
    for (const gate of city.gates)
      expect(smoothed.mesh.vertices[gate.vertexId].point).toEqual(city.mesh.vertices[gate.vertexId].point);
  });

  it.each(
    (
      [
        [
          [-50, 0],
          [150, 0]
        ],
        [
          [-50, 50],
          [0, 50]
        ],
        [
          [-50, 50],
          [50, 150]
        ]
      ] as Point[][]
    ).map(points => ({ points }))
  )("does not create gates when a highway only follows or touches the wall (%j)", ({ points }) => {
    const source = town(points);
    expect(installRegionalRoadGates(source)).toEqual(source);
  });

  it("preserves locked curtains", () => {
    const source = town();
    source.featureGroups[0].locked = true;
    expect(installRegionalRoadGates(source)).toEqual(source);
  });

  it("opens a crossing at an imported polyline corner", () => {
    const source = town([
      [-50, 40],
      [0, 50],
      [150, 60]
    ]);
    const city = installRegionalRoadGates(source);
    expect(city.gates).toHaveLength(2);
    expect(city.frameRoads).toEqual(source.frameRoads);
    expect(validGeneratedCrossings(city)).toBe(true);
    expect(validate(city)).toEqual([]);
  });
});
