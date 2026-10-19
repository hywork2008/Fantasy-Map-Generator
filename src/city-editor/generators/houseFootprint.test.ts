import { describe, expect, it } from "vitest";
import { buildingSurfaces, concatPositions, meshIsClosed } from "../../city3d/core/massingGeometry";
import type { CityDocument } from "../types/document";
import type { Point } from "../types/primitives";
import { assignBuildingMassing } from "./buildingMassing";
import { frontageBuildings } from "./frontageBuildings";
import type { Front } from "./frontageBuildings.types";
import { pointInPolygon, polygonArea } from "./geom";
import { houseFootprint } from "./houseFootprint";
import { intersectConvex, plotArea } from "./parcelGeometry";
import { makeRng } from "./prng";

function fronts(poly: Point[]): Front[] {
  const sign = -Math.sign(polygonArea(poly));
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const axis: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const inward: Point = [-sign * axis[1], sign * axis[0]];
    return { a, axis, inward, length, offset: a[0] * inward[0] + a[1] * inward[1], primary: false };
  });
}

describe("roofable town house footprints", () => {
  it("retains dense rectangles and fits modest skew without making rear gardens", () => {
    for (const lot of [
      [
        [0, 0],
        [6, 0],
        [6, 18],
        [0, 18]
      ],
      [
        [0, 0],
        [9, 0],
        [8, 12],
        [0, 12]
      ]
    ] as Point[][]) {
      const house = houseFootprint(lot, fronts(lot));
      expect(house).toHaveLength(4);
      expect(plotArea(house) / plotArea(lot)).toBeGreaterThan(0.9);
      if (lot[1][0] === 6) expect(house).toEqual(lot);
    }
  });

  it("fits four substantial walls inside bevelled and acute parcels with either winding", () => {
    for (const source of [
      [
        [0, 0],
        [16, 0],
        [16, 8],
        [10, 12],
        [0, 12]
      ],
      [
        [0, 0],
        [40, 0],
        [0, 12]
      ]
    ] as Point[][]) {
      for (const reverse of [false, true]) {
        const lot = (reverse ? [...source].reverse() : source).map(
          ([x, y]): Point => [
            100 + x * Math.cos(0.63) - y * Math.sin(0.63),
            -40 + x * Math.sin(0.63) + y * Math.cos(0.63)
          ]
        );
        const house = houseFootprint(lot, fronts(lot));
        expect(house).toHaveLength(4);
        expect(plotArea(house)).toBeGreaterThan(plotArea(lot) * 0.45);
        expect(plotArea(intersectConvex(house, lot))).toBeCloseTo(plotArea(house), 5);
        for (let i = 0; i < 4; i++) {
          const a = house[i],
            b = house[(i + 1) % 4],
            c = house[(i + 2) % 4];
          expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeGreaterThanOrEqual(2.5 - 1e-6);
          expect((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])).toBeCloseTo(0, 5);
        }
      }
    }
  });

  it("leaves a triangular block tip open and passes the dense built body to pitched roofs", () => {
    const block: Point[] = [
      [0, 0],
      [100, 0],
      [0, 24]
    ];
    const houses = frontageBuildings(
      block,
      [0, 1, 2],
      {
        lotArea: 80,
        coverage: 0.95,
        occupancy: 1,
        outskirts: false,
        perimeter: true,
        rowDepth: 12
      },
      makeRng("acute-tip")
    );
    expect(houses.length).toBeGreaterThan(6);
    expect(houses.some(house => pointInPolygon([98, 0.1], house))).toBe(false);
    expect(houses.reduce((sum, house) => sum + plotArea(house), 0) / plotArea(block)).toBeGreaterThan(0.65);
    for (let i = 0; i < houses.length; i++) {
      expect(houses[i]).toHaveLength(4);
      expect(plotArea(intersectConvex(houses[i], block))).toBeCloseTo(plotArea(houses[i]), 5);
      for (let j = i + 1; j < houses.length; j++)
        expect(plotArea(intersectConvex(houses[i], houses[j]))).toBeLessThan(1e-5);
    }
    const document = { historicalPeriod: "highMedieval" } as CityDocument;
    const lots = assignBuildingMassing(
      document,
      houses.map(polygon => ({ faceId: "block", polygon, landmark: false }))
    );
    expect(lots.every(lot => lot.massing?.roof.form === "gable" || lot.massing?.roof.form === "hip")).toBe(true);
    for (const lot of lots) {
      const surfaces = buildingSurfaces(lot.polygon, lot.massing!);
      expect(surfaces).not.toBeNull();
      const positions = concatPositions(surfaces!.walls, surfaces!.roofs);
      expect(positions.every(Number.isFinite)).toBe(true);
      expect(meshIsClosed(positions)).toBe(true);
    }
  });
});
