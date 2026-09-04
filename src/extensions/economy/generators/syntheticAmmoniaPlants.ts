/**
 * Synthetic-ammonia plants and synthetic-ammonia-plant chemistry trials.
 * Design: docs/plan/synthetic-ammonia-vertical-slice.md §3.6 — same shape as phosphateFertilizerPlants.ts.
 */

import { getTechnologyProgressEntries, getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getChemistryTrials,
  getSimulationYear,
  getSyntheticAmmoniaPlants,
  getWorldContext,
  setChemistryTrials,
  setSyntheticAmmoniaPlants,
  settleAnnualOnce
} from "../economyContext";
import type { ChemistryTrial } from "./chemistryTypes";
import {
  addNamedStock,
  consumeNamed,
  debitTreasury,
  marketIdForBurg,
  pickSponsorBurg,
  SYNTHETIC_AMMONIA_PLANT_BUDGET
} from "./chemMedCommon";

/**
 * Output only starts once the prerequisite (catalyticChemistry) is demonstrated somewhere in the
 * world — same "trial can start early, output waits for the groundwork" structure as
 * PhosphateFertilizerPlants' worldHasIndustrialSulfuricAcid().
 */
function worldHasCatalyticChemistry(): boolean {
  return getTechnologyProgressEntries().some(
    entry => entry.technologyId === "catalyticChemistry" && isTechnologyStageAtLeast(entry.stage, "demonstrated")
  );
}

function trialFor(stateId: number, trials: ChemistryTrial[]): ChemistryTrial {
  const existing = trials.find(
    trial => trial.kind === "syntheticAmmoniaPlant" && trial.stateId === stateId && trial.status === "running"
  );
  if (existing) return existing;
  const created: ChemistryTrial = {
    kind: "syntheticAmmoniaPlant",
    burgId: 0,
    stateId,
    status: "running",
    operatingYears: 0,
    documentedRuns: 0,
    failureCount: 0,
    inputsConsumed: 0,
    outputsDelivered: 0
  };
  trials.push(created);
  return created;
}

export class SyntheticAmmoniaPlantsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.syntheticAmmoniaPlants)) return false;

    const plants = [...getSyntheticAmmoniaPlants()];
    const trials = [...getChemistryTrials()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("syntheticAmmonia", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let plant = plants.find(entry => entry.stateId === state.i && entry.active);
      if (!plant) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, SYNTHETIC_AMMONIA_PLANT_BUDGET)) continue;
        plant = {
          burgId,
          stateId: state.i,
          role: "trial",
          active: true,
          utilization: 0,
          documentedRuns: 0,
          lastFundedYear: year
        };
        plants.push(plant);
      } else if (isTechnologyStageAtLeast(stage, "adopted") && plant.role === "trial") {
        plant.role = "service";
      }

      if (!debitTreasury(state.i, SYNTHETIC_AMMONIA_PLANT_BUDGET)) {
        plant.active = false;
        const trial = trials.find(
          entry => entry.kind === "syntheticAmmoniaPlant" && entry.stateId === state.i && entry.status === "running"
        );
        if (trial) {
          trial.status = "failed";
          trial.lastFailureReason = "fundingCut";
          trial.failureCount += 1;
        }
        continue;
      }
      plant.lastFundedYear = year;
      plant.active = true;

      const marketId = marketIdForBurg(plant.burgId);
      // Coke stands in for both the hydrogen source and the process-energy demand of the
      // high-pressure catalytic reaction — no dedicated Hydrogen Good, no Steam Power capacity
      // service (docs/plan/synthetic-ammonia-vertical-slice.md §7 decisions 1, 2, 6). Amount
      // calibration TBD.
      const coke = consumeNamed(marketId, "Coke", 1.2);
      const coverage = Math.min(1, coke / 1.2);
      plant.utilization = rn(Math.max(0, coverage), 4);

      const trial = trialFor(state.i, trials);
      trial.burgId = plant.burgId;
      trial.operatingYears += 1;
      trial.inputsConsumed = rn(trial.inputsConsumed + coke, 4);
      if (plant.utilization >= 0.5) {
        trial.documentedRuns += 1;
        plant.documentedRuns += 1;
        trial.status = "running";
        if (worldHasCatalyticChemistry()) {
          // trial/service scale is deliberately smaller than AcidPlant's 0.15/0.6 — the 1909
          // Haber demonstration was bench-scale. Calibration TBD.
          const produced = addNamedStock(marketId, "Synthetic Ammonia", plant.role === "trial" ? 0.1 : 0.4);
          trial.outputsDelivered = rn(trial.outputsDelivered + produced, 4);
        }
      } else {
        trial.failureCount += 1;
        trial.lastFailureReason = "materialShortage";
      }
    }

    setSyntheticAmmoniaPlants(plants);
    setChemistryTrials(trials);
    return true;
  }
}

export const SyntheticAmmoniaPlants = new SyntheticAmmoniaPlantsModule();
