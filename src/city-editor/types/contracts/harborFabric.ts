import type { Id, Point } from "../primitives";

export interface HarborCrane {
  id: Id;
  kind: "treadwheel" | "derrick" | "romanMagnaRota";
  point: Point;
  armAngleRad: number;
  radiusMeters: number;
  /** Horizontal radius to the falling hoist line, shared by SVG and the model factory. */
  armLengthMeters: number;
  pulleyHeightMeters?: number;
  hookHeightMeters?: number;
  berthId?: string;
}

export interface HarborCargoPile {
  id: Id;
  kind: "crates" | "barrels" | "bales" | "ballast";
  point: Point;
  widthMeters: number;
  heightMeters: number;
  rotation: number;
}
