/**
 * Crude-oil refineries and oil-refinery chemistry trials.
 * Design: docs/plan/petroleum-and-internal-combustion-vertical-slice.md §3.6-3.7 — same shape as
 * mercuryPlants.ts, minus the contamination debt, plus a second output Good (this economy's first
 * plant that yields two Goods from one input).
 */

import { getTechnologyProgressEntries, getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  getChemistryTrials,
  getOilRefineryPlants,
  getOilRefineryPlantsLastSettledYear,
  getSimulationYear,
  getWorldContext,
  setChemistryTrials,
  setOilRefineryPlants,
  setOilRefineryPlantsLastSettledYear
} from "../economyContext";
import type { ChemistryTrial } from "./chemistryTypes";
import {
  addNamedStock,
  consumeNamed,
  debitTreasury,
  marketIdForBurg,
  OIL_REFINERY_PLANT_BUDGET,
  pickSponsorBurg
} from "./chemMedCommon";

/**
 * Output only starts once the prerequisite (modernDrillingAndFieldOperations) is demonstrated
 * somewhere in the world — same "trial can start early, output waits for the groundwork"
 * structure as AcidPlants'/MercuryPlants' worldHasFoundation().
 */
function worldHasModernDrilling(): boolean {
  return getTechnologyProgressEntries().some(
    entry =>
      entry.technologyId === "modernDrillingAndFieldOperations" && isTechnologyStageAtLeast(entry.stage, "demonstrated")
  );
}

function trialFor(stateId: number, trials: ChemistryTrial[]): ChemistryTrial {
  const existing = trials.find(
    trial => trial.kind === "oilRefineryPlant" && trial.stateId === stateId && trial.status === "running"
  );
  if (existing) return existing;
  const created: ChemistryTrial = {
    kind: "oilRefineryPlant",
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

export class OilRefineryPlantsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getOilRefineryPlantsLastSettledYear() === year) return false;
    setOilRefineryPlantsLastSettledYear(year);

    const plants = [...getOilRefineryPlants()];
    const trials = [...getChemistryTrials()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("oilRefiningAndFractionation", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let plant = plants.find(entry => entry.stateId === state.i && entry.active);
      if (!plant) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, OIL_REFINERY_PLANT_BUDGET)) continue;
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

      if (!debitTreasury(state.i, OIL_REFINERY_PLANT_BUDGET)) {
        plant.active = false;
        const trial = trials.find(
          entry => entry.kind === "oilRefineryPlant" && entry.stateId === state.i && entry.status === "running"
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
      // A bulk fuel-mineral throughput — Crude Oil sits at Coal/Bauxite's scale, so this plant
      // consumes noticeably more per year than the chemistry-domain plants' 0.5/0.3/0.1 pattern.
      const crudeOil = consumeNamed(marketId, "Crude Oil", 1.0);
      const fuel = consumeNamed(marketId, "Coal", 0.2);
      const firebrick = consumeNamed(marketId, "Firebrick", 0.1);
      const coverage = Math.min(1, crudeOil / 1.0, fuel / 0.2, firebrick / 0.1);

      plant.utilization = rn(Math.max(0, coverage), 4);

      const trial = trialFor(state.i, trials);
      trial.burgId = plant.burgId;
      trial.operatingYears += 1;
      trial.inputsConsumed = rn(trial.inputsConsumed + crudeOil + fuel + firebrick, 4);
      if (plant.utilization >= 0.5) {
        trial.documentedRuns += 1;
        plant.documentedRuns += 1;
        trial.status = "running";
        if (worldHasModernDrilling()) {
          // Fractional distillation: Kerosene is the bulk cut, Lubricating Oil the small byproduct
          // — both delivered together every operating year.
          const kerosene = addNamedStock(marketId, "Kerosene", plant.role === "trial" ? 0.4 : 1.2);
          const lubricatingOil = addNamedStock(marketId, "Lubricating Oil", plant.role === "trial" ? 0.08 : 0.25);
          trial.outputsDelivered = rn(trial.outputsDelivered + kerosene + lubricatingOil, 4);
        }
      } else {
        trial.failureCount += 1;
        trial.lastFailureReason = "materialShortage";
      }
    }

    setOilRefineryPlants(plants);
    setChemistryTrials(trials);
    return true;
  }
}

export const OilRefineryPlants = new OilRefineryPlantsModule();
