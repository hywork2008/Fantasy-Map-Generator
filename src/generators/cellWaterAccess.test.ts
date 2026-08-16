import { describe, expect, it } from "vitest";
import {
  getCellWaterAccess,
  getWellCapacityBonus,
  hasAdjacentRiver,
  RAINFED_WELL_PRECIPITATION
} from "./cellWaterAccess";

const cells = {
  r: [0, 7, 0, 0],
  harbor: [0, 0, 1, 0],
  conf: [0, 0, 0, 0],
  c: [[1], [0, 2], [1], []]
};

describe("cellWaterAccess", () => {
  it("treats an on-cell river as surface water, not a well site", () => {
    expect(getCellWaterAccess(cells, 1)).toMatchObject({ kind: "river", score: 20, canDigWell: false });
    expect(hasAdjacentRiver(cells, 1)).toBe(false);
  });

  it("lets a river neighbour irrigate by ditch or well", () => {
    expect(getCellWaterAccess(cells, 0)).toMatchObject({
      kind: "adjacentRiver",
      score: 16,
      canDigWell: true,
      irrigationSupplement: 4
    });
  });

  it("allows a rainfed well when precipitation is enough to recharge it", () => {
    expect(getCellWaterAccess({ r: [0], c: [[]] }, 0, RAINFED_WELL_PRECIPITATION)).toMatchObject({
      kind: "rainfedWell",
      score: 12,
      canDigWell: true
    });
    expect(getCellWaterAccess({ r: [0], c: [[]] }, 0, RAINFED_WELL_PRECIPITATION - 1).kind).toBe("none");
  });

  it("adds well capacity for village wells and state well works", () => {
    const access = getCellWaterAccess(cells, 0);
    expect(getWellCapacityBonus(access, 0)).toBeCloseTo(0.15);
    expect(getWellCapacityBonus(access, 1)).toBeCloseTo(0.2);
    expect(getWellCapacityBonus(getCellWaterAccess(cells, 1), 0)).toBe(0);
  });
});
