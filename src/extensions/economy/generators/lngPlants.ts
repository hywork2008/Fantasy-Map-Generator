/**
 * Cryogenic natural-gas liquefaction plants and their chemistry trials.
 * Design: docs/plan/natural-gas-lng-power-generation.md §3.7-3.8 — same shape as
 * oilRefineryPlants.ts, minus the second output (this plant yields only LNG).
 */

import { getTechnologyProgressEntries, getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getChemistryTrials,
  getLNGPlants,
  getSimulationYear,
  getWorldContext,
  setChemistryTrials,
  setLNGPlants,
  settleAnnualOnce
} from "../economyContext";
import type { ChemistryTrial } from "./chemistryTypes";
import {
  addNamedStock,
  consumeNamed,
  debitTreasury,
  LNG_PLANT_BUDGET,
  marketIdForBurg,
  pickSponsorBurg
} from "./chemMedCommon";

/**
 * Output only starts once the prerequisite (modernDrillingAndFieldOperations) is demonstrated
 * somewhere in the world — same "trial can start early, output waits for the groundwork"
 * structure as OilRefineryPlants' worldHasModernDrilling(). Natural Gas rides along the same
 * oilField deposits as Crude Oil (§3.2), so both refining chains share this same upstream gate.
 */
function worldHasModernDrilling(): boolean {
  return getTechnologyProgressEntries().some(
    entry =>
      entry.technologyId === "modernDrillingAndFieldOperations" && isTechnologyStageAtLeast(entry.stage, "demonstrated")
  );
}

function trialFor(stateId: number, trials: ChemistryTrial[]): ChemistryTrial {
  const existing = trials.find(
    trial => trial.kind === "lngPlant" && trial.stateId === stateId && trial.status === "running"
  );
  if (existing) return existing;
  const created: ChemistryTrial = {
    kind: "lngPlant",
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

export class LNGPlantsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.lngPlants)) return false;

    const plants = [...getLNGPlants()];
    const trials = [...getChemistryTrials()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("naturalGasLiquefaction", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let plant = plants.find(entry => entry.stateId === state.i && entry.active);
      if (!plant) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, LNG_PLANT_BUDGET)) continue;
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

      if (!debitTreasury(state.i, LNG_PLANT_BUDGET)) {
        plant.active = false;
        const trial = trials.find(
          entry => entry.kind === "lngPlant" && entry.stateId === state.i && entry.status === "running"
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
      // Natural Gas sits at the same bulk-fuel-mineral scale as Crude Oil (OilRefineryPlants'
      // Crude Oil 1.0). Coal is the compressor/refrigeration process energy; Machine Parts stands
      // in for compressor/cryogenic equipment instead of Firebrick — a liquefaction plant has no
      // furnace firebox to reline.
      const naturalGas = consumeNamed(marketId, "Natural Gas", 1.0);
      const fuel = consumeNamed(marketId, "Coal", 0.3);
      const machineParts = consumeNamed(marketId, "Machine Parts", 0.15);
      const coverage = Math.min(1, naturalGas / 1.0, fuel / 0.3, machineParts / 0.15);

      plant.utilization = rn(Math.max(0, coverage), 4);

      const trial = trialFor(state.i, trials);
      trial.burgId = plant.burgId;
      trial.operatingYears += 1;
      trial.inputsConsumed = rn(trial.inputsConsumed + naturalGas + fuel + machineParts, 4);
      if (plant.utilization >= 0.5) {
        trial.documentedRuns += 1;
        plant.documentedRuns += 1;
        trial.status = "running";
        if (worldHasModernDrilling()) {
          // Same trial/service output ratio as OilRefineryPlants' Kerosene (the bulk cut) — LNG
          // is this plant's sole output, no secondary byproduct like Lubricating Oil.
          const lng = addNamedStock(marketId, "LNG", plant.role === "trial" ? 0.4 : 1.2);
          trial.outputsDelivered = rn(trial.outputsDelivered + lng, 4);
        }
      } else {
        trial.failureCount += 1;
        trial.lastFailureReason = "materialShortage";
      }
    }

    setLNGPlants(plants);
    setChemistryTrials(trials);
    return true;
  }
}

export const LNGPlants = new LNGPlantsModule();
