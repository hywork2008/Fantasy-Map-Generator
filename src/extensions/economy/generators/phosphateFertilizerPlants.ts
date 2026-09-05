/**
 * Phosphate-fertilizer plants and phosphate-fertilizer-plant chemistry trials.
 * Design: docs/plan/phosphate-fertilizer-vertical-slice.md §3.7 — same shape as acidPlants.ts.
 */

import { getTechnologyProgressEntries, getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getChemistryTrials,
  getPhosphateFertilizerPlants,
  getSimulationYear,
  getWorldContext,
  setChemistryTrials,
  setPhosphateFertilizerPlants,
  settleAnnualOnce
} from "../economyContext";
import type { ChemistryTrial } from "./chemistryTypes";
import {
  addNamedStock,
  consumeNamed,
  debitTreasury,
  FACILITY_MAINTENANCE_RATE,
  marketIdForBurg,
  PHOSPHATE_FERTILIZER_PLANT_BUDGET,
  pickSponsorBurg
} from "./chemMedCommon";

/**
 * Output only starts once the prerequisite (industrialSulfuricAcid) is demonstrated somewhere in
 * the world — same "trial can start early, output waits for the groundwork" structure as
 * AcidPlants' worldHasFoundation().
 */
function worldHasIndustrialSulfuricAcid(): boolean {
  return getTechnologyProgressEntries().some(
    entry => entry.technologyId === "industrialSulfuricAcid" && isTechnologyStageAtLeast(entry.stage, "demonstrated")
  );
}

function trialFor(stateId: number, trials: ChemistryTrial[]): ChemistryTrial {
  const existing = trials.find(
    trial => trial.kind === "phosphateFertilizerPlant" && trial.stateId === stateId && trial.status === "running"
  );
  if (existing) return existing;
  const created: ChemistryTrial = {
    kind: "phosphateFertilizerPlant",
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

export class PhosphateFertilizerPlantsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.phosphateFertilizerPlants)) return false;

    const plants = [...getPhosphateFertilizerPlants()];
    const trials = [...getChemistryTrials()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("phosphateFertilizer", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let plant = plants.find(entry => entry.stateId === state.i && entry.active);
      if (!plant) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, PHOSPHATE_FERTILIZER_PLANT_BUDGET)) continue;
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

      if (!debitTreasury(state.i, rn(PHOSPHATE_FERTILIZER_PLANT_BUDGET * FACILITY_MAINTENANCE_RATE, 2))) {
        plant.active = false;
        const trial = trials.find(
          entry => entry.kind === "phosphateFertilizerPlant" && entry.stateId === state.i && entry.status === "running"
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
      // Ratio matches the Phosphate Fertilizer craft recipe (goods-generator.ts): 1 Phosphate
      // Rock : 0.6 Sulfuric Acid.
      const phosphateRock = consumeNamed(marketId, "Phosphate Rock", 0.5);
      const sulfuricAcid = consumeNamed(marketId, "Sulfuric Acid", 0.3);
      const coverage = Math.min(1, phosphateRock / 0.5, sulfuricAcid / 0.3);
      plant.utilization = rn(Math.max(0, coverage), 4);

      const trial = trialFor(state.i, trials);
      trial.burgId = plant.burgId;
      trial.operatingYears += 1;
      trial.inputsConsumed = rn(trial.inputsConsumed + phosphateRock + sulfuricAcid, 4);
      if (plant.utilization >= 0.5) {
        trial.documentedRuns += 1;
        plant.documentedRuns += 1;
        trial.status = "running";
        if (worldHasIndustrialSulfuricAcid()) {
          const produced = addNamedStock(marketId, "Phosphate Fertilizer", plant.role === "trial" ? 0.2 : 0.8);
          trial.outputsDelivered = rn(trial.outputsDelivered + produced, 4);
        }
      } else {
        trial.failureCount += 1;
        trial.lastFailureReason = "materialShortage";
      }
    }

    setPhosphateFertilizerPlants(plants);
    setChemistryTrials(trials);
    return true;
  }
}

export const PhosphateFertilizerPlants = new PhosphateFertilizerPlantsModule();
