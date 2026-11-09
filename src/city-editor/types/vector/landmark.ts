import type { Id, Point } from "../primitives";

export interface Windmill {
  id: Id;
  kind: "post" | "tower";
  name: string;
  center: Point;
  /** Mound (post mill) or tower (tower mill) radius. */
  baseRadius: number;
  /** Direction the sails face (radians, CCW from +X / east); one prevailing wind for the whole town. */
  facing: number;
  /** Angle of the first sail in the sail plane. */
  sailAngle: number;
  sailLength: number;
}

export interface Gallows {
  id: Id;
  name: string;
  center: Point;
  moundRadius: number;
  pillars: Point[];
  path: Point[];
}

/** Free-standing landmarks beyond the town, by the mesh editor's aerial-landmark rules (P6f). */
export interface VectorOpenLandmarks {
  windmills: Windmill[];
  gallows: Gallows[];
}
