import { describe, expect, it } from "vitest";
import {
  allowsGeneratedSeaLanes,
  DEFAULT_FRONTIER_POLITY_SPACING,
  DEFAULT_FRONTIER_START_MODE,
  frontierFoundationRegionFloor,
  frontierRegionCenterDistanceWeight,
  frontierStartLandFloors,
  isFrontierSeaborneLanding,
  MIN_FRONTIER_START_LAND_CELLS,
  minFrontierStartLandCells,
  normalizeFrontierPolitySpacing,
  normalizeFrontierStartMode,
  shouldSeedInitialFleets
} from "./frontierStartMode";

describe("normalizeFrontierStartMode", () => {
  it("defaults unknown values to land origin", () => {
    expect(normalizeFrontierStartMode(undefined)).toBe(DEFAULT_FRONTIER_START_MODE);
    expect(normalizeFrontierStartMode("hinterland")).toBe("landOrigin");
    expect(normalizeFrontierStartMode("seaborne")).toBe("seaborne");
    expect(normalizeFrontierStartMode("landOrigin")).toBe("landOrigin");
  });
});

describe("frontier start land floors", () => {
  it("keeps a large homeland even for a capital-only realm", () => {
    expect(minFrontierStartLandCells(1)).toBe(MIN_FRONTIER_START_LAND_CELLS);
    expect(minFrontierStartLandCells(30)).toBe(180);
  });

  it("relaxes toward 2 cells and never to 1", () => {
    expect(frontierStartLandFloors(1)).toEqual([80, 40, 16, 4, 2]);
    expect(frontierStartLandFloors(30)[0]).toBe(180);
    expect(frontierStartLandFloors(30).at(-1)).toBe(2);
  });
});

describe("frontier polity spacing", () => {
  it("defaults unknown values to dispersed", () => {
    expect(normalizeFrontierPolitySpacing(undefined)).toBe(DEFAULT_FRONTIER_POLITY_SPACING);
    expect(normalizeFrontierPolitySpacing("clustered")).toBe("clustered");
    expect(normalizeFrontierPolitySpacing("dispersed")).toBe("dispersed");
    expect(normalizeFrontierPolitySpacing("nearby")).toBe("dispersed");
  });

  it("asks for one foundation region per polity when dispersed", () => {
    expect(frontierFoundationRegionFloor(1, "clustered")).toBe(1);
    expect(frontierFoundationRegionFloor(3, "clustered")).toBe(1);
    expect(frontierFoundationRegionFloor(10, "clustered")).toBe(2);
    expect(frontierFoundationRegionFloor(1, "dispersed")).toBe(1);
    expect(frontierFoundationRegionFloor(3, "dispersed")).toBe(3);
    expect(frontierFoundationRegionFloor(0, "dispersed")).toBe(0);
    expect(frontierRegionCenterDistanceWeight("dispersed")).toBeGreaterThan(
      frontierRegionCenterDistanceWeight("clustered")
    );
  });
});

describe("frontier sea-lane / fleet gate", () => {
  it("blocks ships and searoutes only for frontier land origin", () => {
    expect(allowsGeneratedSeaLanes({ initialSettlementPattern: "frontier", frontierStartMode: "landOrigin" })).toBe(
      false
    );
    expect(allowsGeneratedSeaLanes({ initialSettlementPattern: "frontier", frontierStartMode: "seaborne" })).toBe(true);
    expect(allowsGeneratedSeaLanes({ initialSettlementPattern: "standard" })).toBe(true);
    expect(shouldSeedInitialFleets({ initialSettlementPattern: "frontier", frontierStartMode: "landOrigin" })).toBe(
      false
    );
    expect(shouldSeedInitialFleets({ initialSettlementPattern: "marches", frontierStartMode: "landOrigin" })).toBe(
      true
    );
    expect(isFrontierSeaborneLanding({ initialSettlementPattern: "frontier", frontierStartMode: "seaborne" })).toBe(
      true
    );
    expect(isFrontierSeaborneLanding({ initialSettlementPattern: "frontier", frontierStartMode: "landOrigin" })).toBe(
      false
    );
  });
});
