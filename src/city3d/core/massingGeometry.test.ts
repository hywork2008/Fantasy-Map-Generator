import { describe, expect, it } from "vitest";
import type { BuildingLot } from "../../city-editor/generators/buildingLots.types";
import { assignBuildingMassing } from "../../city-editor/generators/buildingMassing";
import type { CityDocument } from "../../city-editor/types/document";
import { buildingSurfaces, concatPositions, meshIsClosed } from "./massingGeometry";

function lot(partial: Partial<BuildingLot> & Pick<BuildingLot, "polygon">): BuildingLot {
  return {
    faceId: "f",
    id: "b",
    landmark: false,
    role: "main",
    uses: ["residential"],
    storeys: 2,
    ...partial
  };
}

function massingFor(building: BuildingLot, period = "highMedieval") {
  const [assigned] = assignBuildingMassing({ historicalPeriod: period, generationSeed: "geo" } as CityDocument, [
    building
  ]);
  return assigned.massing!;
}

function maxY(positions: Float32Array): number {
  let y = 0;
  for (let i = 1; i < positions.length; i += 3) y = Math.max(y, positions[i]);
  return y;
}

function minX(positions: Float32Array): number {
  let x = Infinity;
  for (let i = 0; i < positions.length; i += 3) x = Math.min(x, positions[i]);
  return x;
}

describe("building surfaces", () => {
  it("closes skewed four-wall roofs with shared ridge ends, including jettied upper floors", () => {
    const source: [number, number][] = [
      [0, 0],
      [8, 0],
      [6, 15],
      [0, 13]
    ];
    for (const reverse of [false, true])
      for (const angle of [0, 0.63]) {
        const polygon = (reverse ? [...source].reverse() : source).map(([x, y]): [number, number] => [
          70 + x * Math.cos(angle) - y * Math.sin(angle),
          -40 + x * Math.sin(angle) + y * Math.cos(angle)
        ]);
        for (const storeys of [1, 3]) {
          const massing = massingFor(lot({ polygon, storeys }));
          for (const form of ["gable", "hip", "pyramid"] as const) {
            massing.roof.form = form;
            const surfaces = buildingSurfaces(polygon, massing)!;
            const positions = concatPositions(surfaces.walls, surfaces.roofs);
            expect(positions.every(Number.isFinite)).toBe(true);
            expect(meshIsClosed(positions), `${form}:${storeys}:${reverse}:${angle}`).toBe(true);
            expect(maxY(positions)).toBeGreaterThan(massing.eaveHeightMeters);
            expect(maxY(positions)).toBeLessThanOrEqual(massing.eaveHeightMeters + 4.00001);
          }
        }
      }
  });
  const rectangle = [
    [0, 0],
    [20, 0],
    [20, 8],
    [0, 8]
  ] as [number, number][];
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10]
  ] as [number, number][];

  it.each(["highMedieval", "classicalAntiquity", "ageOfExploration"])(
    "keeps long and oversized ordinary roofs below a 4 m rise in %s",
    period => {
      for (const [length, width] of [
        [160, 3],
        [160, 100]
      ]) {
        for (const angle of [0, 0.7, 1.9]) {
          const polygon = [
            [0, 0],
            [length, 0],
            [length, width],
            [0, width]
          ].map(([x, y]): [number, number] => [
            x * Math.cos(angle) - y * Math.sin(angle),
            x * Math.sin(angle) + y * Math.cos(angle)
          ]);
          const massing = massingFor(lot({ polygon }), period);
          const surfaces = buildingSurfaces(polygon, massing)!;
          const positions = concatPositions(surfaces.walls, surfaces.roofs);
          expect(maxY(positions)).toBeLessThanOrEqual(massing.eaveHeightMeters + 4.00001);
          expect(meshIsClosed(positions)).toBe(true);
          if (width === 3) expect(maxY(positions)).toBeLessThan(massing.eaveHeightMeters + 2.2);
        }
      }
    }
  );

  it("keeps jetties within the footprint bounds at acute corners", () => {
    const polygon: [number, number][] = [
      [0, 0],
      [160, 2],
      [0, 4]
    ];
    const massing = massingFor(lot({ polygon }));
    massing.jettyMeters = 0.4;
    const surfaces = buildingSurfaces(polygon, massing)!;
    const positions = concatPositions(surfaces.walls, surfaces.roofs);
    for (let i = 0; i < positions.length; i += 3) expect(positions[i]).toBeLessThanOrEqual(160);
    expect(maxY(positions)).toBeLessThan(massing.eaveHeightMeters + 4.00001);
    expect(meshIsClosed(positions)).toBe(true);
  });

  it("places plan +y on -Z so the view matches the SVG", () => {
    const massing = massingFor(lot({ polygon: square }));
    const surfaces = buildingSurfaces(square, massing)!;
    const positions = concatPositions(surfaces.walls, surfaces.roofs);
    let northEast = false;
    let southEast = false;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i] < 9) continue;
      if (positions[i + 2] < -9) northEast = true;
      if (Math.abs(positions[i + 2]) < 1) southEast = true;
    }
    expect(northEast).toBe(true);
    expect(southEast).toBe(true);
  });

  it("closes a flat stone insula", () => {
    const building = lot({ polygon: square, storeys: 4, uses: ["residential", "retail"] });
    const massing = massingFor(building, "classicalAntiquity");
    expect(massing.roof.form).toBe("flat");
    const surfaces = buildingSurfaces(building.polygon, massing);
    expect(surfaces).not.toBeNull();
    const positions = concatPositions(surfaces!.walls, surfaces!.roofs);
    expect(meshIsClosed(positions)).toBe(true);
    expect(maxY(positions)).toBeCloseTo(massing.eaveHeightMeters, 5);
  });

  it("closes a gable, a hip and a lean-to", () => {
    const gable = massingFor(lot({ polygon: rectangle, archetype: "patrician-house" }));
    expect(gable.roof.form).toBe("gable");
    expect(gable.jettyMeters).toBe(0);
    const hip = massingFor(lot({ polygon: square, archetype: "elite-compound" }));
    expect(hip.roof.form).toBe("hip");
    const shed = massingFor(lot({ polygon: rectangle, role: "shed", uses: ["storage"], storeys: 1 }));
    expect(shed.roof.form).toBe("lean-to");
    for (const massing of [gable, hip, shed]) {
      const surfaces = buildingSurfaces(massing === shed ? rectangle : massing === hip ? square : rectangle, massing);
      const positions = concatPositions(surfaces!.walls, surfaces!.roofs);
      expect(meshIsClosed(positions), massing.roof.form).toBe(true);
      expect(maxY(positions)).toBeGreaterThan(massing.eaveHeightMeters + 0.5);
    }
  });

  it("lets a timber jetty step outside the footprint and stay closed", () => {
    const massing = massingFor(lot({ polygon: rectangle }));
    expect(massing.jettyMeters).toBe(0.4);
    const surfaces = buildingSurfaces(rectangle, massing)!;
    const positions = concatPositions(surfaces.walls, surfaces.roofs);
    expect(meshIsClosed(positions)).toBe(true);
    expect(minX(positions)).toBeLessThan(-0.2);
  });

  it("draws a concave footprint as a closed flat roof", () => {
    const concave = lot({
      polygon: [
        [0, 0],
        [12, 0],
        [12, 5],
        [5, 5],
        [5, 12],
        [0, 12]
      ]
    });
    const massing = massingFor(concave);
    expect(massing.roof.form).toBe("flat");
    expect(massing.jettyMeters).toBe(0);
    const surfaces = buildingSurfaces(concave.polygon, massing)!;
    expect(meshIsClosed(concatPositions(surfaces.walls, surfaces.roofs))).toBe(true);
  });
});
