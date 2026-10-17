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
