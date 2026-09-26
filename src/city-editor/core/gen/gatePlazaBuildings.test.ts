import { describe, expect, it } from "vitest";
import { gatePlazaRadiusMeters } from "../passages";
import type { CityDocument } from "../types";
import type { BuildingLot } from "./buildingLots";
import { polygonBitesDisk, relieveGatePlazaBuildings } from "./gatePlazaBuildings";

function walledTown(): CityDocument {
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 200, cityRadiusMeters: 80, blockSizeMeters: 20 },
    mesh: {
      vertices: {
        w1: { id: "w1", point: [-40, 0], locked: false },
        g: { id: "g", point: [0, 0], locked: false },
        w2: { id: "w2", point: [40, 0], locked: false }
      },
      edges: {
        wallA: { id: "wallA", a: "w1", b: "g", leftFace: null, rightFace: null, locked: false },
        wallB: { id: "wallB", a: "g", b: "w2", leftFace: null, rightFace: null, locked: false }
      },
      faces: {}
    },
    featureGroups: [
      {
        id: "wall-1",
        kind: "wall",
        name: "Wall",
        segments: [
          { edgeId: "wallA", forward: true },
          { edgeId: "wallB", forward: true }
        ],
        style: { widthMeters: 10, color: "#342a22" },
        locked: false
      }
    ],
    gates: [{ id: "gate-1", vertexId: "g", locked: false }],
    elements: [{ id: "plaza", kind: "plaza", faceIds: [], point: [0, 50], locked: false }]
  };
}

function house(faceId: string, x0: number, x1: number, y0: number, y1: number): BuildingLot {
  return {
    faceId,
    landmark: false,
    polygon: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1]
    ]
  };
}

describe("relieveGatePlazaBuildings", () => {
  const radius = gatePlazaRadiusMeters(10);

  it("omits a house bitten by the plaza and widens its neighbour up to the plaza edge", () => {
    const document = walledTown();
    const kept = house("f1", 24, 32, -4, 6);
    const bitten = house("f1", 16, 24, -4, 6);
    const far = house("f2", 80, 88, 80, 88);
    const next = relieveGatePlazaBuildings(document, [kept, bitten, far]);
    expect(next).toHaveLength(2);
    expect(next.some(lot => lot.faceId === "f2" && lot.polygon[0][0] === 80)).toBe(true);
    const widened = next.find(lot => lot.faceId === "f1")!;
    const minX = Math.min(...widened.polygon.map(point => point[0]));
    expect(minX).toBeLessThan(23);
    expect(minX).toBeGreaterThan(radius - 0.4);
    expect(polygonBitesDisk(widened.polygon, { center: [0, 0], radius })).toBe(false);
  });

  it("splits the freed frontage between the houses on either side", () => {
    const document = walledTown();
    const left = house("f1", -22, -14, 18, 26);
    const middle = house("f1", -14, 14, 18, 26);
    const right = house("f1", 14, 22, 18, 26);
    const next = relieveGatePlazaBuildings(document, [left, middle, right]);
    expect(next).toHaveLength(2);
    const xs = next.map(lot => lot.polygon.map(point => point[0]));
    const leftEdge = Math.max(...xs[0]);
    const rightEdge = Math.min(...xs[1]);
    expect(leftEdge).toBeGreaterThan(-14);
    expect(leftEdge).toBeLessThan(-10);
    expect(rightEdge).toBeLessThan(14);
    expect(rightEdge).toBeGreaterThan(10);
    for (const lot of next) expect(polygonBitesDisk(lot.polygon, { center: [0, 0], radius })).toBe(false);
  });

  it("leaves the row untouched when no gate plaza reaches it", () => {
    const row = [house("f1", 40, 48, 40, 48), house("f1", 48, 56, 40, 48)];
    expect(relieveGatePlazaBuildings(walledTown(), row)).toEqual(row);
  });
});
