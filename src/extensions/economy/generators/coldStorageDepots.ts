/**
 * Mechanical cold-storage depots: a State-funded capital asset that backs
 * mechanicalRefrigeration's demonstrated/adopted thresholds and produces the storageCapacity
 * settleCellFreshFood() (markets-generator.ts) draws on to rescue otherwise-lost fresh-food
 * surplus into general Market stock.
 * Design: docs/plan/mechanical-refrigeration-and-cold-chain.md §3.5 — same shape as
 * powerStations.ts, minus Firebrick/Copper Wire (a cold-storage compressor is neither a
 * fired boiler nor primarily an electrical device) and minus the instruments Guild Knowledge
 * side effect (refrigeration has no stated spillover into that domain).
 */

import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  getColdStorageDepots,
  getColdStorageDepotsLastSettledYear,
  getSimulationYear,
  getWorldContext,
  setColdStorageDepots,
  setColdStorageDepotsLastSettledYear
} from "../economyContext";
import {
  COLD_STORAGE_DEPOT_BUDGET,
  consumeNamed,
  debitTreasury,
  marketIdForBurg,
  pickSponsorBurg
} from "./chemMedCommon";

/** calibration TBD — annual abstract unit, same scale family as POWER_STATION_BASE_CAPACITY but a
 *  separate capacity pool (raw fresh-food-equivalent units a service-role depot can additionally
 *  rescue per year). See docs/plan/mechanical-refrigeration-and-cold-chain.md §3.5. */
export const COLD_STORAGE_DEPOT_BASE_CAPACITY = 6;
/** Same 4x trial/service ratio as PowerStation. */
const TRIAL_CAPACITY_FACTOR = 0.25;

export class ColdStorageDepotsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getColdStorageDepotsLastSettledYear() === year) return false;
    setColdStorageDepotsLastSettledYear(year);

    const depots = [...getColdStorageDepots()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("mechanicalRefrigeration", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let depot = depots.find(entry => entry.stateId === state.i && entry.active);
      if (!depot) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, COLD_STORAGE_DEPOT_BUDGET)) continue;
        depot = {
          burgId,
          stateId: state.i,
          role: "trial",
          active: true,
          utilization: 0,
          documentedRuns: 0,
          lastFundedYear: year,
          storageCapacity: 0
        };
        depots.push(depot);
      } else if (isTechnologyStageAtLeast(stage, "adopted") && depot.role === "trial") {
        depot.role = "service";
      }

      if (!debitTreasury(state.i, COLD_STORAGE_DEPOT_BUDGET)) {
        depot.active = false;
        depot.lastFailureReason = "fundingCut";
        depot.storageCapacity = 0;
        continue;
      }
      depot.lastFundedYear = year;
      depot.active = true;

      const marketId = marketIdForBurg(depot.burgId);
      // Annual input scale: calibration TBD. LNG is the compressor fuel; Machine Parts is the
      // compressor/insulation equipment. No Firebrick (no fired boiler) and no Copper Wire (not
      // primarily an electrical device).
      const lng = consumeNamed(marketId, "LNG", 2);
      const machineParts = consumeNamed(marketId, "Machine Parts", 1.2);
      const coverage = Math.min(1, lng / 2, machineParts / 1.2);
      depot.utilization = rn(Math.max(0, coverage), 4);

      if (depot.utilization >= 0.5) {
        depot.documentedRuns += 1;
        // storageCapacity is a flow recomputed every settled year, not accumulated like a Good
        // stock — settleCellFreshFood() reads it directly (state-wide pool, §3.5 decision 1), the
        // same one-year lag PowerGridInvestment already has relative to PowerStations.
        depot.storageCapacity = rn(
          COLD_STORAGE_DEPOT_BASE_CAPACITY * (depot.role === "trial" ? TRIAL_CAPACITY_FACTOR : 1) * depot.utilization,
          4
        );
      } else {
        depot.lastFailureReason = "materialShortage";
        depot.storageCapacity = 0;
      }
    }

    setColdStorageDepots(depots);
    return true;
  }
}

export const ColdStorageDepots = new ColdStorageDepotsModule();
