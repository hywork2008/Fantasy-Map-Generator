/**
 * State-funded levees built on LeveeSites (leveeSites.ts) for flood control of high-hazard river
 * reaches. Same annual-settle shape as dams.ts, but simpler — no hydropower-equivalent upgrade,
 * so there is no role/documentedRuns/electrified staging, and protection applies uniformly across
 * the site's whole reach instead of tapering downstream from a single point.
 * Design: docs/plan/river-levee-and-flood-damage.md §3.
 */

import type { PackedGraphCells } from "../../../types/PackedGraph";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getFloodProtection,
  getLeveeSites,
  getLevees,
  getSimulationYear,
  getWorldContext,
  setFloodProtection,
  setLevees,
  settleAnnualOnce
} from "../economyContext";
import {
  CIVIL_INFRASTRUCTURE_MAINTENANCE_RATE,
  consumeNamed,
  debitTreasury,
  LEVEE_BUDGET,
  marketIdForBurg
} from "./chemMedCommon";
import type { Levee, LeveeSite } from "./leveeTypes";

/** A State may maintain several levee reaches at once — looser than Dam's 3, since a reach is
 *  cheaper (LEVEE_BUDGET) and structurally more numerous than a point-source dam. */
export const MAX_LEVEES_PER_STATE = 4;
/** calibration TBD — lower than Dam's FLOOD_BASE(0.6): an embankment is passive containment, not
 *  active discharge/head-driven flood control. */
const LEVEE_FLOOD_BASE = 0.5;

export class LeveesModule {
  /** Discards every built Levee — used when LeveeSites regenerates so no Levee.siteId is left dangling. */
  clear(): void {
    setLevees([]);
  }

  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.levees)) return false;

    const { cells, states } = getWorldContext().pack;
    const sitesById = new Map(getLeveeSites().map(site => [site.i, site]));
    const levees = [...getLevees()];

    this.foundNewLevees(states ?? [], cells, sitesById, levees, year);

    for (const levee of levees) {
      if (!levee.active) continue;
      const site = sitesById.get(levee.siteId);
      if (!site) {
        levee.active = false;
        continue;
      }
      this.settleLevee(levee, year);
    }

    this.applyFloodProtection(levees, sitesById);
    setLevees(levees);
    return true;
  }

  /** Founds at most one new levee per under-quota State this year, on its best unclaimed site. */
  private foundNewLevees(
    states: readonly { i: number; removed?: boolean }[],
    cells: Pick<PackedGraphCells, "state">,
    sitesById: Map<number, LeveeSite>,
    levees: Levee[],
    year: number
  ): void {
    for (const state of states) {
      if (!state?.i || state.removed) continue;

      const activeCount = levees.filter(levee => levee.stateId === state.i && levee.active).length;
      if (activeCount >= MAX_LEVEES_PER_STATE) continue;

      const claimedSiteIds = new Set(
        levees.filter(levee => levee.stateId === state.i && levee.active).map(l => l.siteId)
      );
      // Ownership is resolved dynamically off the reach's first cell (same characteristic as
      // Dam's single-cell site — a border shift can hand a reach to a different State over time).
      const candidateSite = [...sitesById.values()]
        .filter(site => !claimedSiteIds.has(site.i) && (cells.state?.[site.cells[0]!] ?? 0) === state.i)
        .sort((a, b) => b.qualityScore - a.qualityScore || a.i - b.i)[0];
      if (!candidateSite) continue;

      const burgId = this.findNearestBurgId(candidateSite.cells[0]!, state.i);
      if (!burgId || !debitTreasury(state.i, LEVEE_BUDGET)) continue;

      levees.push({
        i: levees.length + 1,
        siteId: candidateSite.i,
        stateId: state.i,
        burgId,
        active: true,
        utilization: 0,
        lastFundedYear: year,
        protectionRating: 0
      });
    }
  }

  private settleLevee(levee: Levee, year: number): void {
    if (!debitTreasury(levee.stateId, rn(LEVEE_BUDGET * CIVIL_INFRASTRUCTURE_MAINTENANCE_RATE, 2))) {
      levee.active = false;
      levee.lastFailureReason = "fundingCut";
      levee.utilization = 0;
      levee.protectionRating = 0;
      return;
    }
    levee.lastFundedYear = year;

    const marketId = marketIdForBurg(levee.burgId);
    // Annual input scale: calibration TBD. Stone/Timber are the embankment fill and timber
    // revetment, built and maintained the same way every year — more Timber-heavy than Dam's
    // weir since a levee is earthwork, not masonry with an intake.
    const stone = consumeNamed(marketId, "Stone", 1);
    const timber = consumeNamed(marketId, "Timber", 3);
    const coverage = Math.min(1, stone / 1, timber / 3);
    levee.utilization = rn(Math.max(0, coverage), 4);

    if (levee.utilization >= 0.5) {
      levee.lastFailureReason = undefined;
      levee.protectionRating = rn(LEVEE_FLOOD_BASE * levee.utilization, 4);
    } else {
      levee.lastFailureReason = "materialShortage";
      levee.protectionRating = 0;
    }
  }

  /**
   * Raises floodProtectionByCell to at least each active Levee's protectionRating across its
   * site's whole reach — a floor on top of whatever AgTechInvestment.settleAnnual() and
   * Dams.settleAnnual() already wrote earlier in the same annual tick, never a replacement.
   * Unlike Dam's downstream taper, a levee protects its reach uniformly (no decay by distance) —
   * that is the physical extent of the embankment, no more. Re-applied every year so the floor
   * survives AgTechInvestment's own EWMA decay.
   */
  private applyFloodProtection(levees: readonly Levee[], sitesById: Map<number, LeveeSite>): void {
    const count = getWorldContext().pack.cells.i.length;
    const current = getFloodProtection();
    const next = current.length === count ? current.slice() : new Float32Array(count);

    for (const levee of levees) {
      if (!levee.active || levee.protectionRating <= 0) continue;
      const site = sitesById.get(levee.siteId);
      if (!site) continue;

      for (const cellId of site.cells) {
        if ((next[cellId] ?? 0) < levee.protectionRating) next[cellId] = levee.protectionRating;
      }
    }

    setFloodProtection(next);
  }

  private findNearestBurgId(cellId: number, stateId: number): number {
    const { burgs, cells } = getWorldContext().pack;
    const point = cells.p[cellId];
    let nearestId = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const burg of burgs ?? []) {
      if (!burg?.i || burg.removed || burg.state !== stateId || !burg.market) continue;
      if (!point) return burg.i;
      const dx = burg.x - point[0];
      const dy = burg.y - point[1];
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = burg.i;
      }
    }
    return nearestId;
  }
}

export const Levees = new LeveesModule();
