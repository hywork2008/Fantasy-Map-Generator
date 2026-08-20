/**
 * River levees: geographic siting plus the State capital asset built on it, for flood control of
 * high-hazard river reaches that a point-source Dam's downstream taper doesn't reach.
 * Design: docs/plan/river-levee-and-flood-damage.md §3.
 *
 * Unlike DamSite/Dam (damTypes.ts), a levee protects a contiguous *reach* of river cells rather
 * than a single point with tapering downstream reach — a real embankment runs alongside the
 * floodplain it protects, not just at one dam site. LeveeSite is generated once (deterministic,
 * like DamSite); Levee is the State-funded asset built on it, settled annually.
 */

export interface LeveeSite {
  i: number;
  riverId: number;
  /** Ordered, contiguous, downstream-walked land river cells this site's embankment would run
   *  along. All share `riverId`; length is capped at MAX_LEVEE_REACH_CELLS. */
  cells: number[];
  /** Reach midpoint, for map placement. */
  x: number;
  y: number;
  /** 0..1, mean computeNaturalFloodRisk() across `cells`. */
  meanFloodHazard: number;
  /** Ranks candidate sites within a State — hazard weighted by the population/farmland it would
   *  protect. */
  qualityScore: number;
}

export type LeveeFailureReason = "materialShortage" | "fundingCut";

/** Simpler than Dam — a levee has no second capability to unlock (no hydropower-equivalent
 *  upgrade), so there is no `role`/`documentedRuns`/`electrified` staging. */
export interface Levee {
  i: number;
  siteId: number;
  stateId: number;
  burgId: number;
  active: boolean;
  utilization: number;
  lastFundedYear: number;
  /** 0..1. Applied uniformly (no taper) across the site's `cells` — a floor on floodProtection,
   *  same Math.max semantics as Dam.floodProtectionRating. */
  protectionRating: number;
  lastFailureReason?: LeveeFailureReason;
}
