/**
 * Chlorine plants — catalytic oxidation (Deacon process) of Salt + Sulfuric Acid into Chlorine.
 * Same shape as AcidPlants, settled right after it in index.tsx since this recipe consumes
 * AcidPlants' Sulfuric Acid output.
 * Design: docs/plan/chlorine-production-vertical-slice.md §3.6.
 */

import { getTechnologyProgressEntries, getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getChemistryTrials,
  getChlorinePlants,
  getSimulationYear,
  getWorldContext,
  setChemistryTrials,
  setChlorinePlants,
  settleAnnualOnce
} from "../economyContext";
import type { ChemistryTrial } from "./chemistryTypes";
import {
  addNamedStock,
  CHLORINE_PLANT_BUDGET,
  consumeNamed,
  debitTreasury,
  marketIdForBurg,
  pickSponsorBurg
} from "./chemMedCommon";

function worldHasCatalyticChemistry(): boolean {
  return getTechnologyProgressEntries().some(
    entry => entry.technologyId === "catalyticChemistry" && isTechnologyStageAtLeast(entry.stage, "demonstrated")
  );
}

function trialFor(stateId: number, trials: ChemistryTrial[]): ChemistryTrial {
  const existing = trials.find(
    trial => trial.kind === "chlorinePlant" && trial.stateId === stateId && trial.status === "running"
  );
  if (existing) return existing;
  const created: ChemistryTrial = {
    kind: "chlorinePlant",
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

export class ChlorinePlantsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.chlorinePlants)) return false;

    const plants = [...getChlorinePlants()];
    const trials = [...getChemistryTrials()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("catalyticChemistry", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let plant = plants.find(entry => entry.stateId === state.i && entry.active);
      if (!plant) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, CHLORINE_PLANT_BUDGET)) continue;
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

      if (!debitTreasury(state.i, CHLORINE_PLANT_BUDGET)) {
        plant.active = false;
        const trial = trials.find(
          entry => entry.kind === "chlorinePlant" && entry.stateId === state.i && entry.status === "running"
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
      const salt = consumeNamed(marketId, "Salt", 0.5);
      const sulfuricAcid = consumeNamed(marketId, "Sulfuric Acid", 0.3);
      const fuel = consumeNamed(marketId, "Coal", 0.15);
      // Firebrick lines the catalyst bed the Deacon reaction runs through — light draw, same
      // order as AcidPlants' burner-stage lining.
      const firebrick = consumeNamed(marketId, "Firebrick", 0.05);
      const coverage = Math.min(1, salt / 0.5, sulfuricAcid / 0.3, fuel / 0.15, firebrick / 0.05);
      plant.utilization = rn(Math.max(0, coverage), 4);

      const trial = trialFor(state.i, trials);
      trial.burgId = plant.burgId;
      trial.operatingYears += 1;
      trial.inputsConsumed = rn(trial.inputsConsumed + salt + sulfuricAcid + fuel + firebrick, 4);
      if (plant.utilization >= 0.5) {
        trial.documentedRuns += 1;
        plant.documentedRuns += 1;
        trial.status = "running";
        if (worldHasCatalyticChemistry()) {
          const produced = addNamedStock(marketId, "Chlorine", plant.role === "trial" ? 0.15 : 0.6);
          trial.outputsDelivered = rn(trial.outputsDelivered + produced, 4);
        }
      } else {
        trial.failureCount += 1;
        trial.lastFailureReason = "materialShortage";
      }
    }

    setChlorinePlants(plants);
    setChemistryTrials(trials);
    return true;
  }
}

export const ChlorinePlants = new ChlorinePlantsModule();
