/**
 * Sulfuric-acid plants and acid-plant chemistry trials.
 * Design: docs/plan/chemistry-medicine-knowledge-accumulation.md §5.2, §6–8
 */

import { getTechnologyProgressEntries, getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getAcidPlants,
  getChemistryTrials,
  getSimulationYear,
  getWorldContext,
  setAcidPlants,
  setChemistryTrials,
  settleAnnualOnce
} from "../economyContext";
import type { ChemistryTrial } from "./chemistryTypes";
import {
  ACID_PLANT_BUDGET,
  addNamedStock,
  consumeNamed,
  debitTreasury,
  marketIdForBurg,
  pickSponsorBurg
} from "./chemMedCommon";

function worldHasFoundation(): boolean {
  return getTechnologyProgressEntries().some(
    entry =>
      entry.technologyId === "chemicalIndustryFoundation" && isTechnologyStageAtLeast(entry.stage, "demonstrated")
  );
}

function trialFor(stateId: number, trials: ChemistryTrial[]): ChemistryTrial {
  const existing = trials.find(
    trial => trial.kind === "acidPlant" && trial.stateId === stateId && trial.status === "running"
  );
  if (existing) return existing;
  const created: ChemistryTrial = {
    kind: "acidPlant",
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

export class AcidPlantsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.acidPlants)) return false;

    const plants = [...getAcidPlants()];
    const trials = [...getChemistryTrials()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("industrialSulfuricAcid", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let plant = plants.find(entry => entry.stateId === state.i && entry.active);
      if (!plant) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, ACID_PLANT_BUDGET)) continue;
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

      if (!debitTreasury(state.i, ACID_PLANT_BUDGET)) {
        plant.active = false;
        const trial = trials.find(
          entry => entry.kind === "acidPlant" && entry.stateId === state.i && entry.status === "running"
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
      const sulfur = consumeNamed(marketId, "Sulfur", 0.5);
      let fuel = consumeNamed(marketId, "Coal", 0.3);
      if (fuel <= 0) fuel = consumeNamed(marketId, "Charcoal", 0.3);
      const lead = consumeNamed(marketId, "Lead Ingot", 0.1);
      const glass = consumeNamed(marketId, "Lab Glassware", 0.05) || consumeNamed(marketId, "Glass", 0.08);
      // Firebrick lines the burner/roaster stage feeding the lead chamber; the chamber itself
      // runs cooler than a smelter or converter, so this draws a light rate, same order as Lead.
      const firebrick = consumeNamed(marketId, "Firebrick", 0.1);
      const coverage = Math.min(1, sulfur / 0.5, fuel / 0.3, lead / 0.1, glass / 0.05, firebrick / 0.1);
      plant.utilization = rn(Math.max(0, coverage), 4);

      const trial = trialFor(state.i, trials);
      trial.burgId = plant.burgId;
      trial.operatingYears += 1;
      trial.inputsConsumed = rn(trial.inputsConsumed + sulfur + fuel + lead + glass + firebrick, 4);
      if (plant.utilization >= 0.5) {
        trial.documentedRuns += 1;
        plant.documentedRuns += 1;
        trial.status = "running";
        if (worldHasFoundation()) {
          const produced = addNamedStock(marketId, "Sulfuric Acid", plant.role === "trial" ? 0.15 : 0.6);
          trial.outputsDelivered = rn(trial.outputsDelivered + produced, 4);
        }
      } else {
        trial.failureCount += 1;
        trial.lastFailureReason = glass < 0.02 ? "glassBreakage" : "materialShortage";
      }
    }

    setAcidPlants(plants);
    setChemistryTrials(trials);
    return true;
  }
}

export const AcidPlants = new AcidPlantsModule();
