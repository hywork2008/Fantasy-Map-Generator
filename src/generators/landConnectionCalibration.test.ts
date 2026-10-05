import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import {
  calibrateApproachCost,
  calibrateBridgeCosts,
  calibrateLandConnectionPair,
  calibrateWorldLandConnectionPair,
  type LandConnectionCalibration
} from "./landConnectionCalibration";

const profile: LandConnectionCalibration = {
  baseSizeReference: 100,
  maximumImportance: 4,
  capitalBonus: 1,
  portBonus: 0.5,
  allowanceMeters: 200,
  maximumAllowanceMeters: 600,
  constructionAllowanceMeters: 100,
  maximumConstructionMeters: 300,
  bridgeFixedCostMeters: 20,
  bridgeCostPerSquareMeter: 2,
  bridgeLongSpanCostPerCubicMeter: 0.1,
  bridgeUseCostMeters: 5,
  bridgeUseCostPerMeter: 0.2,
  approachCostPerSquareMeter: 0.5
};
const assessment = {
  minimumImprovementMeters: 1,
  nearEqualCostMeters: 1,
  maxConstructionCostMeters: 1000,
  maxRouteCostMeters: 1000,
  maxSearches: 4
};
const city = { id: 1, baseSize: 100, capital: false, port: false };

describe("explicit land connection calibration", () => {
  it("reads current world food/climate and roles without using population", () => {
    const world = {
      pack: {
        cells: { capacity: [100], subsistenceCapacity: [100], s: [100], h: [30], g: [0] },
        features: [],
        burgs: [{}, { i: 1, cell: 0, capital: 1, population: 0 }, { i: 2, cell: 0, port: 1, population: 100000 }]
      },
      grid: { cells: { temp: [12], prec: [45] } }
    } as unknown as WorldContext;
    const first = calibrateWorldLandConnectionPair(world, 0, 1, 2, profile, assessment);
    world.pack.burgs[1].population = 999999;
    expect(calibrateWorldLandConnectionPair(world, 0, 1, 2, profile, assessment)).toEqual(first);
    expect(first.weight).toBe(2.5);
    world.pack.burgs[2].removed = true;
    expect(() => calibrateWorldLandConnectionPair(world, 0, 1, 2, profile, assessment)).toThrow();
  });

  it("uses food/climate base size before population and limits the weaker endpoint", () => {
    const pair = calibrateLandConnectionPair(
      0,
      city,
      { id: 2, baseSize: 10000, capital: true, port: true },
      profile,
      assessment
    );
    expect(pair.weight).toBe(2);
    expect(pair.unconnectedAllowanceMeters).toBe(400);
    expect(pair.assessmentSettings).toEqual({ maxConstructionCostMeters: 200, maxRouteCostMeters: 200 });
    expect(
      calibrateLandConnectionPair(0, { ...city, baseSize: 0 }, { ...city, id: 2 }, profile, assessment).weight
    ).toBe(1);
  });
  it("saturates credit and never relaxes global construction/route caps", () => {
    const pair = calibrateLandConnectionPair(
      0,
      { ...city, baseSize: 1e9 },
      { ...city, id: 2, baseSize: 1e9 },
      profile,
      { ...assessment, maxConstructionCostMeters: 50, maxRouteCostMeters: 60 }
    );
    expect(pair.weight).toBe(4);
    expect(pair.unconnectedAllowanceMeters).toBe(600);
    expect(pair.assessmentSettings).toEqual({ maxConstructionCostMeters: 50, maxRouteCostMeters: 60 });
  });
  it("charges a long physical deck superlinearly and both outer approaches", () => {
    const short = calibrateBridgeCosts({ deckLengthMeters: 10 }, 2, profile);
    const long = calibrateBridgeCosts({ deckLengthMeters: 20 }, 2, profile);
    expect(short).toEqual({ constructionCostMeters: 80, useCostMeters: 7 });
    expect(long.constructionCostMeters - 20).toBeGreaterThan(2 * (short.constructionCostMeters - 20));
    expect(calibrateApproachCost([30, 40], 2, profile)).toBe(70);
  });
  it("rejects nonfinite coefficients, dimensions and overflowing costs", () => {
    expect(() =>
      calibrateBridgeCosts({ deckLengthMeters: 10 }, 2, { ...profile, maximumAllowanceMeters: Infinity })
    ).toThrow();
    expect(() => calibrateBridgeCosts({ deckLengthMeters: 1e308 }, 2, profile)).toThrow();
    expect(() => calibrateApproachCost([-1, 3], 2, profile)).toThrow();
    expect(() =>
      calibrateLandConnectionPair(0, { ...city, baseSize: NaN }, { ...city, id: 2 }, profile, assessment)
    ).toThrow();
  });
});
