import type { Point } from "../primitives";

/**
 * A ferry where a road meets a river no bridge of the period can span (P5b-4): the mesh editor's figure-of-eight
 * crossing (`planFerryCrossing`), stored as fixed metre geometry. The road ends at the town landing.
 */
export interface VectorFerry {
  id: string;
  riverPathId: string;
  roadPathId: string;
  /** Town-bank landing on the shore, just ahead of the end of the road. */
  landing: Point;
  /** Far-bank landing, square across from `landing`, or where the crossing leaves the frame. */
  farLanding: Point;
  farInFrame: boolean;
  /** Unit vector across the river, from `landing` toward the far bank. */
  across: Point;
  outbound: Point[];
  inbound: Point[];
  townTow: [Point, Point];
  farTow: [Point, Point];
}
