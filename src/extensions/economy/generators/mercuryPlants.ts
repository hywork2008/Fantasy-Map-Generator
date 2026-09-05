/**
 * Cinnabar-roasting mercury plants and mercury-plant chemistry trials.
 * Design: docs/plan/cinnabar-mercury-vertical-slice.md §3.6-3.7 — same shape as
 * phosphateFertilizerPlants.ts, plus an unavoidable per-year contamination debt (roadmap §9.5,
 * §15 decision 10).
 */

import { getTechnologyProgressEntries, getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getChemistryTrials,
  getMercuryPlants,
  getSimulationYear,
  getWorldContext,
  setChemistryTrials,
  setMercuryPlants,
  settleAnnualOnce
} from "../economyContext";
import type { ChemistryTrial } from "./chemistryTypes";
import {
  addNamedStock,
  clamp01,
  consumeNamed,
  debitTreasury,
  FACILITY_MAINTENANCE_RATE,
  MERCURY_PLANT_BUDGET,
  marketIdForBurg,
  pickSponsorBurg
} from "./chemMedCommon";

/** 0..1. A plant whose contamination climbs past this triggers a forced containment shutdown. */
const CONTAMINATION_INCIDENT_THRESHOLD = 0.6;
/** Per operating year, added only when the plant actually ran (raw coverage >= 0.5). */
const CONTAMINATION_PER_SERVICE_YEAR = 0.08;
const CONTAMINATION_PER_TRIAL_YEAR = 0.048;
/** How much a funded cleanup relieves — never brings contamination back to 0. */
const CONTAMINATION_CLEANUP_RELIEF = 0.35;
const CONTAMINATION_CLEANUP_BUDGET_MULTIPLIER = 1.5;

/**
 * Output only starts once the prerequisite (chemicalIndustryFoundation) is demonstrated somewhere
 * in the world — same "trial can start early, output waits for the groundwork" structure as
 * AcidPlants' worldHasFoundation().
 */
function worldHasFoundation(): boolean {
  return getTechnologyProgressEntries().some(
    entry =>
      entry.technologyId === "chemicalIndustryFoundation" && isTechnologyStageAtLeast(entry.stage, "demonstrated")
  );
}

function trialFor(stateId: number, trials: ChemistryTrial[]): ChemistryTrial {
  const existing = trials.find(
    trial => trial.kind === "mercuryPlant" && trial.stateId === stateId && trial.status === "running"
  );
  if (existing) return existing;
  const created: ChemistryTrial = {
    kind: "mercuryPlant",
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

export class MercuryPlantsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.mercuryPlants)) return false;

    const plants = [...getMercuryPlants()];
    const trials = [...getChemistryTrials()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("cinnabarRoastingAndMercuryRecovery", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let plant = plants.find(entry => entry.stateId === state.i && entry.active);
      if (!plant) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, MERCURY_PLANT_BUDGET)) continue;
        plant = {
          burgId,
          stateId: state.i,
          role: "trial",
          active: true,
          utilization: 0,
          documentedRuns: 0,
          lastFundedYear: year,
          contamination: 0
        };
        plants.push(plant);
      } else if (isTechnologyStageAtLeast(stage, "adopted") && plant.role === "trial") {
        plant.role = "service";
      }

      if (!debitTreasury(state.i, rn(MERCURY_PLANT_BUDGET * FACILITY_MAINTENANCE_RATE, 2))) {
        plant.active = false;
        const trial = trials.find(
          entry => entry.kind === "mercuryPlant" && entry.stateId === state.i && entry.status === "running"
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
      // A small-batch retort, deliberately an order of magnitude below AcidPlants' 0.5/0.3/0.1 —
      // roadmap §9.5's "少量生産".
      const cinnabar = consumeNamed(marketId, "Cinnabar", 0.3);
      const fuel = consumeNamed(marketId, "Coal", 0.15);
      const firebrick = consumeNamed(marketId, "Firebrick", 0.05);
      const coverage = Math.min(1, cinnabar / 0.3, fuel / 0.15, firebrick / 0.05);

      // Every year the plant actually ran, contamination accumulates — unavoidable, not something
      // safety investment can prevent (roadmap §15 decision 10). Service-tier plants run more
      // throughput and contaminate faster than a trial-scale operation.
      let contamination = plant.contamination;
      if (coverage >= 0.5) {
        contamination = clamp01(
          contamination + (plant.role === "service" ? CONTAMINATION_PER_SERVICE_YEAR : CONTAMINATION_PER_TRIAL_YEAR)
        );
      }

      // Past the threshold, a containment incident forces a full stoppage this year — utilization
      // 0 regardless of how well-supplied the plant was — whether or not the cleanup bill gets
      // paid. The debt cannot be waved away with abundant stock, only partially repaid.
      let incident = false;
      if (contamination >= CONTAMINATION_INCIDENT_THRESHOLD) {
        incident = true;
        if (debitTreasury(state.i, rn(MERCURY_PLANT_BUDGET * CONTAMINATION_CLEANUP_BUDGET_MULTIPLIER, 2))) {
          contamination = clamp01(contamination - CONTAMINATION_CLEANUP_RELIEF);
        }
      }
      plant.contamination = rn(contamination, 4);
      plant.utilization = incident ? 0 : rn(Math.max(0, coverage), 4);

      const trial = trialFor(state.i, trials);
      trial.burgId = plant.burgId;
      trial.operatingYears += 1;
      trial.inputsConsumed = rn(trial.inputsConsumed + cinnabar + fuel + firebrick, 4);
      if (plant.utilization >= 0.5) {
        trial.documentedRuns += 1;
        plant.documentedRuns += 1;
        trial.status = "running";
        if (worldHasFoundation()) {
          // Roughly a quarter of AcidPlants' trial/service rates — Mercury stays scarce even once
          // the process is adopted.
          const produced = addNamedStock(marketId, "Mercury", plant.role === "trial" ? 0.05 : 0.2);
          trial.outputsDelivered = rn(trial.outputsDelivered + produced, 4);
        }
      } else {
        trial.failureCount += 1;
        trial.lastFailureReason = incident ? "contamination" : "materialShortage";
      }
    }

    setMercuryPlants(plants);
    setChemistryTrials(trials);
    return true;
  }
}

export const MercuryPlants = new MercuryPlantsModule();
