import { describe, expect, it } from "vitest";
import type { CityDocument, Point } from "../types";
import { absorbCellars } from "./cellarAbsorption";
import { polygonArea } from "./geom";

function squareTown(north: number): CityDocument {
  const point = (x: number, y: number): Point => [x, y];
  return {
    mesh: {
      vertices: {
        v0: { id: "v0", point: point(0, 0) },
        v1: { id: "v1", point: point(40, 0) },
        v2: { id: "v2", point: point(40, north) },
        v3: { id: "v3", point: point(0, north) }
      },
      edges: {
        e0: { id: "e0", a: "v0", b: "v1" },
        e1: { id: "e1", a: "v1", b: "v2" },
        e2: { id: "e2", a: "v2", b: "v3" },
        e3: { id: "e3", a: "v3", b: "v0" }
      },
      faces: {
        f0: {
          id: "f0",
          boundary: [
            { edgeId: "e0", forward: true },
            { edgeId: "e1", forward: true },
            { edgeId: "e2", forward: true },
            { edgeId: "e3", forward: true }
          ]
        }
      }
    },
    featureGroups: [],
    siteEconomy: {
      version: 1,
      year: 1350,
      commerce: { rank: 0, marketCenter: false, merchantHouse: null, mint: false, caravanArrivalRank: 0 },
      guilds: [],
      facilities: [],
      tradePartners: [],
      storage: [{ form: "cellar", areaM2: 72, mainGoods: ["Wine"], inflowAzimuthDeg: null, waterborne: false }]
    }
  } as unknown as CityDocument;
}

describe("cellar absorption", () => {
  const house = [
    [10, 6],
    [20, 6],
    [20, 14],
    [10, 14]
  ] as Point[];
  const lane = [
    {
      points: [
        [0, 0],
        [40, 0]
      ] as Point[]
    }
  ];

  it("lengthens the rear of a house by the cellar area and stays inside the block", () => {
    const grown = absorbCellars(squareTown(40), [{ faceId: "f0", polygon: house, landmark: false }], lane);
    expect(Math.abs(polygonArea(grown[0].polygon))).toBeCloseTo(100, 4);
    expect(grown[0].polygon[2][1]).toBeCloseTo(16, 4);
    expect(grown[0].polygon[3][1]).toBeCloseTo(16, 4);
  });

  it("leaves the house when the rear would leave the face", () => {
    const grown = absorbCellars(squareTown(14.05), [{ faceId: "f0", polygon: house, landmark: false }], lane);
    expect(grown[0].polygon).toEqual(house);
  });
});
