import type { ModelShipType, ShipPhysicalDimensions, ShipType } from "../types/ships";

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
  },
  // Model Viewer ships measure their overall length, spars and flight deck included, and scale uniformly.
  "ship-of-the-line": {
    baseLengthMeters: 81.2,
    baseBeamMeters: 15.8,
    defaultSizeMeters: 81.2,
    minSizeMeters: 55,
    maxSizeMeters: 95,
    historicalName: "Ship of the line"
  },
  "war-galley": {
    baseLengthMeters: 51,
    baseBeamMeters: 5.1,
    defaultSizeMeters: 51,
    minSizeMeters: 35,
    maxSizeMeters: 60,
    historicalName: "War galley"
  },
  trireme: {
    baseLengthMeters: 36.2,
    baseBeamMeters: 5.5,
    defaultSizeMeters: 36.2,
    minSizeMeters: 30,
    maxSizeMeters: 42,
    historicalName: "Trireme"
  },
  carrier: {
    baseLengthMeters: 337,
    baseBeamMeters: 78,
    defaultSizeMeters: 337,
    minSizeMeters: 250,
    maxSizeMeters: 350,
    historicalName: "Gerald R. Ford-class aircraft carrier"
  }
};

/** Ships drawn from their Model Viewer model in both the plan and 3D, never chosen by the harbour generator. */
export const MODEL_SHIP_TYPES: readonly ModelShipType[] = ["ship-of-the-line", "war-galley", "trireme", "carrier"];
export const isModelShipType = (type: string): type is ModelShipType =>
  (MODEL_SHIP_TYPES as readonly string[]).includes(type);
