export interface CastleSettings {
  position: "auto" | "edge" | "central";
  relationship: "auto" | "integrated" | "detached";
  form: "auto" | "keep-bailey" | "courtyard";
  size: "auto" | "small" | "standard" | "large";
  style?: "auto" | import("./contracts/castlePatterns").CastleStyle;
}
