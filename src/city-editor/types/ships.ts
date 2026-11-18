/** Sail and river types the generator uses, then Model Viewer ships the editor offers for hand placement. */
export type ShipType = "small" | "medium" | "large" | "barge" | ModelShipType;
export type ModelShipType = "ship-of-the-line" | "war-galley" | "trireme" | "carrier";
export type ShipClassKey = ShipType | "sloop" | "caravel" | "galleon" | "barge" | "river-barge";

export interface ShipPhysicalDimensions {
  baseLengthMeters: number;
  baseBeamMeters: number;
  defaultSizeMeters: number;
  minSizeMeters: number;
  maxSizeMeters: number;
  historicalName: string;
}

export interface ShipDisplayState {
  sails: "set" | "furled";
  gunports: "open" | "closed";
}
