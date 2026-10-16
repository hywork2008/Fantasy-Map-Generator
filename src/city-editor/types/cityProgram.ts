import type { WallPlan } from "./wallPlan";

/**
 * The built programme the Burg-editor Features decide — what to place, as opposed
 * to the terrain to classify (CityGeography). Orthogonal to geography; all false
 * = an open settlement with nothing built. Sourced from a BurgSiteDescriptor's
 * `burg.*` flags (site/siteInput.ts `siteToProgram`).
 *
 * M4a wires the type and consumes only `walls` (S3 compaction). `citadel` /
 * `plaza` land in S4, `temple` / `port` / `shanty` in S6.
 */
export interface CityProgram {
  /** Walled town. Tightens the S3 urban core; S4 promotes the border ring to a
   * drawn wall. */
  walls: boolean;
  /** Fortified inner keep. Placeable with or without a wall. */
  citadel: boolean;
  /** Central market square, reserved as a build-free void. */
  plaza: boolean;
  /** Cathedral / temple precinct. */
  temple: boolean;
  /** Harbour. Only meaningful when a waterbody is present. */
  port: boolean;
  /** Extramural shanty (the slum-grade faubourg). */
  shanty: boolean;
  /** Capital. A light landmark-rank modifier only. */
  capital: boolean;
  /** How S4 shapes and draws the wall ring. Absent ⇒ `DEFAULT_WALL_PLAN`.
   * `site/siteInput.ts` `siteToProgram` fills it from the §8 matrix. */
  wallPlan?: WallPlan;
}
