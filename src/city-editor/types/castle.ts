export interface CastleSettings {
  position: "auto" | "edge" | "central";
  relationship: "auto" | "integrated" | "detached";
  form: "auto" | "keep-bailey" | "courtyard";
  size: "auto" | "small" | "standard" | "large";
  style?: "auto" | import("./contracts/castlePatterns").CastleStyle;
  /** Ground under the castle cells after generation. Absent keeps the natural cell elevations. */
  ground?: "natural" | "cliff" | "slope";
  /** Platform height above the highest castle cell; absent uses DEFAULT_CASTLE_RISE_METERS. */
  groundRiseMeters?: number;
}
