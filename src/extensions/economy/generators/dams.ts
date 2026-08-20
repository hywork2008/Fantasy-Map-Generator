/**
 * State-funded dams built on DamSites (damSites.ts) for flood control and (once generatorAndMotor
 * is known) hydroelectric power. Same annual-settle shape as powerStations.ts, but a State can run
 * up to MAX_DAMS_PER_STATE concurrently (one per DamSite) instead of a single plant — closer to
 * mineOperations.ts's "many sites per State" model, since a Dam is tied to a real river location.
 * Design: docs/plan/dam-flood-control-and-hydropower.md §3.
 */

import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast, type TechnologyStage } from "../../../generators/technologyTypes";
import type { PackedGraphCells } from "../../../types/PackedGraph";
import { rn } from "../../hostUtils";
import {
  getDamSites,
  getDams,
  getDamsLastSettledYear,
  getFloodProtection,
  getSimulationYear,
  getWorldContext,
  setDams,
  setDamsLastSettledYear,
  setFloodProtection
} from "../economyContext";
import { consumeNamed, DAM_BUDGET, debitTreasury, marketIdForBurg } from "./chemMedCommon";
import type { Dam, DamSite } from "./damTypes";
import { upsertInstruments } from "./experimentalWorkshops";

/** A State may run several dams at once (one per site) — looser than PowerStation's single plant
 *  per State, but capped so flood-prone States don't blanket every river in dams. */
export const MAX_DAMS_PER_STATE = 3;
/** Years of utilization >= 0.5 before a trial dam is promoted to service — there is no dedicated
 *  "dam" technology node to key promotion off of (unlike PowerStation's generatorAndMotor stage). */
const DAM_SERVICE_THRESHOLD = 3;
/** calibration TBD — scaled down from POWER_STATION_BASE_CAPACITY(2) since a State can run several
 *  dams concurrently, unlike the single PowerStation per State. */
export const HYDRO_BASE_CAPACITY = 1.5;
const TRIAL_CAPACITY_FACTOR = 0.25;
/** calibration TBD — same order of magnitude as ExperimentalWorkshops' RESEARCHERS(2). */
const DAM_INSTRUMENT_WORKERS = 2;
/** calibration TBD — a "service" dam at full head/discharge protection fully covers its reach. */
const FLOOD_BASE = 0.6;

export class DamsModule {
  /** Discards every built Dam — used when DamSites regenerates so no Dam.siteId is left dangling. */
  clear(): void {
    setDams([]);
  }

  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getDamsLastSettledYear() === year) return false;
    setDamsLastSettledYear(year);

    const { cells, states } = getWorldContext().pack;
    const sitesById = new Map(getDamSites().map(site => [site.i, site]));
    const dams = [...getDams()];

    this.foundNewDams(states ?? [], cells, sitesById, dams, year);

    const generatorAndMotorStageByState = new Map<number, TechnologyStage>();
    for (const dam of dams) {
      if (!dam.active) continue;
      const site = sitesById.get(dam.siteId);
      if (!site) {
        dam.active = false;
        continue;
      }
      this.settleDam(dam, site, year, generatorAndMotorStageByState);
    }

    this.applyFloodProtection(dams, sitesById);
    setDams(dams);
    return true;
  }

  /** Founds at most one new dam per under-quota State this year, on its best unclaimed site. */
  private foundNewDams(
    states: readonly { i: number; removed?: boolean }[],
    cells: Pick<PackedGraphCells, "state">,
    sitesById: Map<number, DamSite>,
    dams: Dam[],
    year: number
  ): void {
    for (const state of states) {
      if (!state?.i || state.removed) continue;

      const activeCount = dams.filter(dam => dam.stateId === state.i && dam.active).length;
      if (activeCount >= MAX_DAMS_PER_STATE) continue;

      const claimedSiteIds = new Set(dams.filter(dam => dam.stateId === state.i && dam.active).map(d => d.siteId));
      const candidateSite = [...sitesById.values()]
        .filter(site => !claimedSiteIds.has(site.i) && (cells.state?.[site.cell] ?? 0) === state.i)
        .sort((a, b) => b.qualityScore - a.qualityScore || a.i - b.i)[0];
      if (!candidateSite) continue;

      const burgId = this.findNearestBurgId(candidateSite.cell, state.i);
      if (!burgId || !debitTreasury(state.i, DAM_BUDGET)) continue;

      dams.push({
        i: dams.length + 1,
        siteId: candidateSite.i,
        stateId: state.i,
        burgId,
        role: "trial",
        active: true,
        utilization: 0,
        documentedRuns: 0,
        lastFundedYear: year,
        electrified: false,
        generationCapacity: 0,
        floodProtectionRating: 0
      });
    }
  }

  private settleDam(
    dam: Dam,
    site: DamSite,
    year: number,
    generatorAndMotorStageByState: Map<number, TechnologyStage>
  ): void {
    if (!debitTreasury(dam.stateId, DAM_BUDGET)) {
      dam.active = false;
      dam.lastFailureReason = "fundingCut";
      dam.utilization = 0;
      dam.generationCapacity = 0;
      dam.floodProtectionRating = 0;
      return;
    }
    dam.lastFundedYear = year;

    const marketId = marketIdForBurg(dam.burgId);
    // Annual input scale: calibration TBD. Stone/Timber are the weir and intake works — built and
    // maintained the same way every year, same shape as PowerStation's Coal/Copper Wire/Machine
    // Parts/Firebrick inputs.
    const stone = consumeNamed(marketId, "Stone", 3);
    const timber = consumeNamed(marketId, "Timber", 2);
    const coverage = Math.min(1, stone / 3, timber / 2);
    dam.utilization = rn(Math.max(0, coverage), 4);

    if (dam.utilization >= 0.5) {
      dam.documentedRuns += 1;
      dam.lastFailureReason = undefined;
      if (dam.documentedRuns >= DAM_SERVICE_THRESHOLD) dam.role = "service";
      dam.floodProtectionRating = rn(
        FLOOD_BASE * (0.5 + 0.5 * site.headPotential) * dam.utilization * (dam.role === "service" ? 1 : 0.4),
        4
      );
    } else {
      dam.lastFailureReason = "materialShortage";
      dam.floodProtectionRating = 0;
    }

    let stage = generatorAndMotorStageByState.get(dam.stateId);
    if (stage === undefined) {
      stage = getTechnologyStage("generatorAndMotor", dam.stateId);
      generatorAndMotorStageByState.set(dam.stateId, stage);
    }
    if (isTechnologyStageAtLeast(stage, "known")) dam.electrified = true;

    if (dam.electrified && dam.utilization >= 0.5) {
      // Water is the fuel — no Coal, unlike PowerStations.
      const copperWire = consumeNamed(marketId, "Copper Wire", 0.6);
      const machineParts = consumeNamed(marketId, "Machine Parts", 0.8);
      const electricCoverage = Math.max(0, Math.min(1, copperWire / 0.6, machineParts / 0.8));
      dam.generationCapacity = rn(
        HYDRO_BASE_CAPACITY *
          (0.4 + 0.6 * site.dischargePotential) *
          (0.5 + 0.5 * site.headPotential) *
          electricCoverage *
          (dam.role === "service" ? 1 : TRIAL_CAPACITY_FACTOR),
        4
      );
      if (dam.generationCapacity > 0) upsertInstruments(dam.burgId, DAM_INSTRUMENT_WORKERS);
    } else {
      dam.generationCapacity = 0;
    }
  }

  /**
   * Raises floodProtectionByCell to at least each active Dam's floodProtectionRating at its site
   * and (tapering with distance) its DamSite.downstreamCells — a floor on top of whatever
   * AgTechInvestment.settleAnnual() already wrote earlier in the same annual tick (index.tsx calls
   * Dams.settleAnnual() well after the investment block), never a replacement. Re-applied every
   * year so the floor survives AgTechInvestment's own EWMA decay.
   */
  private applyFloodProtection(dams: readonly Dam[], sitesById: Map<number, DamSite>): void {
    const count = getWorldContext().pack.cells.i.length;
    const current = getFloodProtection();
    const next = current.length === count ? current.slice() : new Float32Array(count);

    for (const dam of dams) {
      if (!dam.active || dam.floodProtectionRating <= 0) continue;
      const site = sitesById.get(dam.siteId);
      if (!site) continue;

      if ((next[site.cell] ?? 0) < dam.floodProtectionRating) next[site.cell] = dam.floodProtectionRating;

      const hops = site.downstreamCells.length;
      site.downstreamCells.forEach((cellId, index) => {
        const taperedFloor = dam.floodProtectionRating * (1 - index / (hops * 2));
        if ((next[cellId] ?? 0) < taperedFloor) next[cellId] = taperedFloor;
      });
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

export const Dams = new DamsModule();
