/**
 * Annual apothecary workshops and compounding trials.
 * Design: docs/plan/chemistry-medicine-knowledge-accumulation.md §4–7
 */

import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { applyKnowledgeEwma, rn } from "../../hostUtils";
import {
  getApothecaryWorkshops,
  getApothecaryWorkshopsLastSettledYear,
  getChemistryTrials,
  getSimulationYear,
  getWorldContext,
  setApothecaryWorkshops,
  setApothecaryWorkshopsLastSettledYear,
  setChemistryTrials
} from "../economyContext";
import type { ChemistryTrial } from "./chemistryTypes";
import { APOTHECARY_BUDGET, consumeNamed, debitTreasury, marketIdForBurg, pickSponsorBurg } from "./chemMedCommon";
import { recordObsidianPractice } from "./chemMedPractice";

const ADJUNCTS = ["Honey", "Vinegar", "Salt", "Alum", "Soap"] as const;
const PRACTITIONERS = 2;

function trialKey(stateId: number): (trial: ChemistryTrial) => boolean {
  return trial => trial.kind === "compounding" && trial.stateId === stateId && trial.status === "running";
}

export class ApothecaryWorkshopsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getApothecaryWorkshopsLastSettledYear() === year) return false;
    setApothecaryWorkshopsLastSettledYear(year);

    const workshops = [...getApothecaryWorkshops()];
    const trials = [...getChemistryTrials()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("apothecaryCompounding", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let workshop = workshops.find(entry => entry.sponsorStateId === state.i && entry.active);
      if (!workshop) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, APOTHECARY_BUDGET)) continue;
        workshop = {
          burgId,
          sponsorStateId: state.i,
          active: true,
          practitioners: PRACTITIONERS,
          annualBudget: APOTHECARY_BUDGET,
          compoundingRecord: 0,
          lastFundedYear: year
        };
        workshops.push(workshop);
      } else if (!debitTreasury(state.i, APOTHECARY_BUDGET)) {
        workshop.active = false;
        const trial = trials.find(trialKey(state.i));
        if (trial) {
          trial.status = "failed";
          trial.lastFailureReason = "fundingCut";
          trial.failureCount += 1;
        }
        continue;
      } else {
        workshop.lastFundedYear = year;
        workshop.active = true;
      }

      const marketId = marketIdForBurg(workshop.burgId);
      const herbs = consumeNamed(marketId, "Medicinal herbs", 0.4);
      let adjunct = 0;
      for (const name of ADJUNCTS) {
        adjunct = consumeNamed(marketId, name, 0.15);
        if (adjunct > 0) break;
      }
      const sulfur = consumeNamed(marketId, "Sulfur", 0.05);
      const obsidian = consumeNamed(marketId, "Obsidian", 0.02);
      const consumed = herbs + adjunct + sulfur + obsidian;
      const viable = herbs >= 0.2 && adjunct > 0;

      let trial = trials.find(trialKey(state.i));
      if (!trial) {
        trial = {
          kind: "compounding",
          burgId: workshop.burgId,
          stateId: state.i,
          status: "running",
          operatingYears: 0,
          documentedRuns: 0,
          failureCount: 0,
          inputsConsumed: 0,
          outputsDelivered: 0
        };
        trials.push(trial);
      }
      trial.operatingYears += 1;
      trial.inputsConsumed = rn(trial.inputsConsumed + consumed, 4);
      if (viable) {
        trial.documentedRuns += 1;
        trial.status = "running";
        workshop.compoundingRecord = rn(applyKnowledgeEwma(workshop.compoundingRecord, 1, 0.15), 4);
        if (obsidian > 0) recordObsidianPractice(state.i, year);
      } else {
        trial.failureCount += 1;
        trial.lastFailureReason = herbs < 0.2 ? "materialShortage" : "invalidFormula";
        workshop.compoundingRecord = rn(applyKnowledgeEwma(workshop.compoundingRecord, 0, 0.15), 4);
      }
    }

    setApothecaryWorkshops(workshops);
    setChemistryTrials(trials);
    return true;
  }
}

export const ApothecaryWorkshops = new ApothecaryWorkshopsModule();
