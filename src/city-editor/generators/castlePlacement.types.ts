import type { Mesh } from "../types/document";
import type { Id } from "../types/primitives";

export interface CastleSite {
  seed: string;
  mesh: Mesh;
  faceId: Id;
  position: "edge" | "central";
  relationship: "integrated" | "detached";
  form: "keep-bailey" | "courtyard";
  style?: import("../types/contracts/castlePatterns").CastleStyle;
}
