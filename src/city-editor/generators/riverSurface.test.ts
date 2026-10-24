import { describe, expect, it } from "vitest";
import type { CityDocument, Mesh, Point, WaterKind } from "../types/document";
import { riverDropMeters, riverDropUpperFor, townWaterElevations } from "./riverSurface";

function document(mesh: Mesh, vertices: string[]): CityDocument {
  return {
    format: "fmg-city-editor",
    version: 4,
    frame: { extentMeters: 200, cityRadiusMeters: 80, blockSizeMeters: 40 },
    mesh,
    featureGroups: [
      {
        id: "river",
        kind: "river",
        name: "River",
        vertices,
        source: null,
        mouth: null,
        style: { widthMeters: 4, color: "#527f8b" },
        locked: false
      }
    ],
    gates: [],
    elements: []
  } as CityDocument;
}

function mesh(): Mesh {
  return { vertices: {}, edges: {}, faces: {} };
}

function addCell(target: Mesh, id: string, x0: number, y0: number, x1: number, y1: number, elevation: number): void {
  const points: Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1]
  ];
  const ids = points.map((_, index) => `${id}v${index}`);
  ids.forEach((vertexId, index) => {
    target.vertices[vertexId] = { id: vertexId, point: points[index], locked: false };
  });
  const edgeIds = points.map((_, index) => `${id}e${index}`);
  edgeIds.forEach((edgeId, index) => {
    target.edges[edgeId] = {
      id: edgeId,
      a: ids[index],
      b: ids[(index + 1) % ids.length],
      leftFace: id,
      rightFace: null,
      locked: false
    };
  });
  target.faces[id] = {
    id,
    boundary: edgeIds.map(edgeId => ({ edgeId, forward: true })),
    properties: { elevation, water: "land" as WaterKind, ward: null, buildable: true, locked: false }
  };
}

function station(target: Mesh, id: string, point: Point): void {
  target.vertices[id] = { id, point, locked: false };
}

describe("river surface", () => {
  it("keeps a 1 m gap under level land and can drop the river to 0 m", () => {
    const cells = mesh();
    addCell(cells, "land", -40, -20, 40, 20, 100);
    station(cells, "up", [-20, 0]);
    station(cells, "down", [20, 0]);
    const shallow = townWaterElevations(document(cells, ["up", "down"]), 1);
    expect(shallow.riverAt([-20, 0])).toBe(99);
    expect(shallow.riverAt([20, 0])).toBe(99);
    const deep = townWaterElevations(document(cells, ["up", "down"]), 100);
    expect(deep.riverAt([-20, 0])).toBe(0);
    expect(deep.riverAt([20, 0])).toBe(0);
    expect(riverDropMeters(undefined)).toBe(1);
    expect(riverDropUpperFor(document(cells, ["up", "down"]))).toBe(100);
  });

  it("falls toward the lower bank and does not climb a later rise", () => {
    const cells = mesh();
    addCell(cells, "high", -40, -12, -8, 12, 100);
    addCell(cells, "low", -4, -12, 16, 12, 40);
    addCell(cells, "rise", 24, -12, 50, 12, 80);
    station(cells, "up", [-24, 0]);
    station(cells, "mid", [6, 0]);
    station(cells, "down", [36, 0]);
    const water = townWaterElevations(document(cells, ["up", "mid", "down"]), 1);
    const upstream = water.riverAt([-24, 0])!;
    const middle = water.riverAt([6, 0])!;
    const downstream = water.riverAt([36, 0])!;
    expect(upstream).toBe(99);
    expect(middle).toBe(39);
    expect(downstream).toBeLessThanOrEqual(middle);
    expect(downstream).toBeLessThanOrEqual(80);
  });

  it("does not lift a river over a high centre", () => {
    const cells = mesh();
    addCell(cells, "west", -46, -12, -18, 12, 10);
    addCell(cells, "centre", -8, -12, 8, 12, 100);
    addCell(cells, "east", 18, -12, 46, 12, 10);
    station(cells, "up", [-30, 0]);
    station(cells, "mid", [0, 0]);
    station(cells, "down", [30, 0]);
    const water = townWaterElevations(document(cells, ["up", "mid", "down"]), 1);
    const upstream = water.riverAt([-30, 0])!;
    const centre = water.riverAt([0, 0])!;
    expect(upstream).toBe(9);
    expect(centre).toBeLessThanOrEqual(upstream);
    expect(centre).toBeLessThan(50);
    expect(water.riverAt([30, 0])!).toBeLessThanOrEqual(centre);
  });
});
