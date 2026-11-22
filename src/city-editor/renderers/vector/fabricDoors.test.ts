import { describe, expect, it } from "vitest";
import type { BuildingFrontageCandidate } from "../../generators/buildingFrontage";
import type { BuildingLot } from "../../generators/buildingLots.types";
import { fabricDoorFrontage } from "./fabricDoors";

// A 6 x 10 m house, its ridge along y: gable walls at y = 0 and y = 10.
const lot = { faceId: "f", landmark: false, polygon: [] } as unknown as BuildingLot;
const candidates: BuildingFrontageCandidate[] = [
  { kind: "gable", flip: false, door: [1.5, 10], normal: [0, 1] },
  { kind: "eave", flip: false, door: [6, 2.5], normal: [1, 0] },
  { kind: "gable", flip: true, door: [4.5, 0], normal: [0, -1] },
  { kind: "eave", flip: true, door: [0, 7.5], normal: [-1, 0] }
];

describe("fabric house doors in 3D", () => {
  it("turns the door to the recorded entrance, not to the model's first side", () => {
    // The plot's street lies south: the house's door is on its south gable, its way runs out to the street.
    const frontage = fabricDoorFrontage(() => [
      [3, 0],
      [3, -3]
    ])(lot, candidates);
    expect(frontage.normal).toEqual([0, -1]);
    expect(frontage.source).toBe("access");
  });

  it("keeps the first side for a house without an entrance", () => {
    expect(fabricDoorFrontage(() => undefined)(lot, candidates).normal).toEqual([0, 1]);
  });
});
