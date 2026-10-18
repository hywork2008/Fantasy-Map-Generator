import { describe, expect, it } from "vitest";
import { getHarvestBridgeReserve, getStorageClimateLossMultiplier } from "./grainStorage";

describe("grain storage life", () => {
  it("keeps a year's demand after a single annual harvest but only the floor for even supply", () => {
    const annual = 1200;
    const singleHarvest = [0, 0, 0, 0, 0, 0, 0, 1200, 0, 0, 0, 0];
    // August harvest: this month and the eleven after it have no later offers.
    expect(getHarvestBridgeReserve(annual, singleHarvest, 8, 3)).toBeCloseTo(1200, 6);
    // Next July, one month before the harvest, the three-month floor applies.
    expect(getHarvestBridgeReserve(annual, singleHarvest, 7, 3)).toBeCloseTo(300, 6);
    expect(getHarvestBridgeReserve(annual, new Array(12).fill(100), 8, 3)).toBeCloseTo(300, 6);
    // Two harvests six months apart bridge half a year.
    const twoHarvests = [0, 0, 600, 0, 0, 0, 0, 0, 600, 0, 0, 0];
    expect(getHarvestBridgeReserve(annual, twoHarvests, 3, 3)).toBeCloseTo(600, 6);
  });

  it("uses the floor until a whole year of offers is known", () => {
    const partial = [-1, -1, -1, -1, -1, -1, -1, 1200, -1, -1, -1, -1];
    expect(getHarvestBridgeReserve(1200, partial, 8, 3)).toBeCloseTo(300, 6);
  });

  it("spoils hot humid stores fastest and cold stores slowest", () => {
    expect(getStorageClimateLossMultiplier(0, 20)).toBeCloseTo(0.7, 6);
    expect(getStorageClimateLossMultiplier(27, 0)).toBeCloseTo(1.3, 6);
    expect(getStorageClimateLossMultiplier(27, 20)).toBeCloseTo(2, 6);
  });
});
