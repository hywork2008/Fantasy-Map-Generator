import type { ShipPhysicalDimensions, ShipType } from "../types/ships";

export const SHIP_DIMENSIONS: Record<ShipType, ShipPhysicalDimensions> = {
  small: {
    baseLengthMeters: 16,
    baseBeamMeters: 5,
    defaultSizeMeters: 16,
    minSizeMeters: 10,
    maxSizeMeters: 22,
    historicalName: "Sloop"
  },
  medium: {
    baseLengthMeters: 25,
    baseBeamMeters: 7.5,
    defaultSizeMeters: 25,
    minSizeMeters: 18,
    maxSizeMeters: 32,
    historicalName: "Caravel"
  },
  large: {
    baseLengthMeters: 42,
    baseBeamMeters: 11.5,
    defaultSizeMeters: 42,
    minSizeMeters: 30,
    maxSizeMeters: 55,
    historicalName: "Galleon"
  },
  barge: {
    baseLengthMeters: 18,
    baseBeamMeters: 4.8,
    defaultSizeMeters: 18,
    minSizeMeters: 10,
    maxSizeMeters: 28,
    historicalName: "River Barge"
  }
};
