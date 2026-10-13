export type ShipType = "small" | "medium" | "large" | "barge";
export type ShipClassKey = ShipType | "sloop" | "caravel" | "galleon" | "barge" | "river-barge";

export interface ShipPhysicalDimensions {
  baseLengthMeters: number;
  baseBeamMeters: number;
  defaultSizeMeters: number;
  minSizeMeters: number;
  maxSizeMeters: number;
  historicalName: string;
}
