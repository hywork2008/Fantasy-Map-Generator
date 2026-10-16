import type { Point } from "../types/primitives";

export interface FrontageOptions {
  housingCluster?: boolean;
  lotArea: number;
  coverage: number;
  occupancy: number;
  outskirts: boolean;
  /** Coverage applies to the complete block, leaving one compact courtyard. */
  perimeter?: boolean;
  /** Compact town houses: vary shallow rectangular footprints along a street wall. */
  compact?: boolean;
  /** Short attached houses; shallow opposing rows share their rear boundary. */
  attached?: boolean;
  /** Main-road fronts are occupied before secondary lanes. */
  primaryEdges?: number[];
  /** Organic streets and houses use the same dwelling-depth scale. */
  rowDepth?: number;
}

export type Front = { a: Point; axis: Point; inward: Point; length: number; offset: number; primary: boolean };
