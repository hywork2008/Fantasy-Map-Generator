/**
 * Shared ExperimentalWorkshop (steam §4.2 and chemistry/medicine).
 * Design: docs/plan/chemistry-medicine-knowledge-accumulation.md §4, steam-engine-knowledge-accumulation.md §4.2
 */

import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { applyKnowledgeEwma, rn } from "../../hostUtils";
import {
  getCraftDomainEmploymentRecords,
  getExperimentalWorkshops,
  getExperimentalWorkshopsLastSettledYear,
  getSimulationYear,
  getWorldContext,
  setCraftDomainEmploymentRecords,
  setExperimentalWorkshops,
  setExperimentalWorkshopsLastSettledYear
} from "../economyContext";
import { consumeNamed, debitTreasury, EXPERIMENTAL_BUDGET, marketIdForBurg, pickSponsorBurg } from "./chemMedCommon";
import { getPracticeForState, recordLabGlassPractice, recordObsidianPractice } from "./chemMedPractice";
import type { CraftDomainEmploymentRecord } from "./guildKnowledgeTypes";
import { biasExperimentRecordRate, getWorkshopPatronageAppliedGold } from "./technologyBiasApply";
import { patronageFundedBurgId } from "./technologyPatronage";

const RESEARCHERS = 2;

function canOpenWorkshop(stateId: number): boolean {
  return (
    isTechnologyStageAtLeast(getTechnologyStage("laboratoryGlassware", stateId), "known") ||
    isTechnologyStageAtLeast(getTechnologyStage("experimentalNaturalPhilosophy", stateId), "known")
  );
}

function upsertInstruments(burgId: number, workers: number): void {
  const rows = [...getCraftDomainEmploymentRecords()];
  const existing = rows.find(row => row.burgId === burgId && row.domain === "instruments");
  if (existing) existing.workers = Math.max(existing.workers, workers);
  else {
    const created: CraftDomainEmploymentRecord = { burgId, domain: "instruments", workers };
    rows.push(created);
  }
  setCraftDomainEmploymentRecords(rows);
}

export class ExperimentalWorkshopsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getExperimentalWorkshopsLastSettledYear() === year) return false;
    setExperimentalWorkshopsLastSettledYear(year);

    const workshops = [...getExperimentalWorkshops()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      if (!canOpenWorkshop(state.i)) continue;

      let workshop = workshops.find(entry => entry.sponsorStateId === state.i && entry.active);
      if (!workshop) {
        const fundedBurgId = patronageFundedBurgId(state.i, year);
        const burgId = fundedBurgId ?? pickSponsorBurg(state.i);
        if (!burgId) continue;
        const applied = getWorkshopPatronageAppliedGold(burgId, state.i, year);
        const need = Math.max(0, EXPERIMENTAL_BUDGET - applied);
        if (need > 0 && !debitTreasury(state.i, need)) continue;
        workshop = {
          burgId,
          sponsorStateId: state.i,
          active: true,
          researchers: RESEARCHERS,
          annualBudget: EXPERIMENTAL_BUDGET,
          experimentRecord: 0,
          lastFundedYear: year
        };
        workshops.push(workshop);
      } else {
        // Patronage gold is appliedGold; empty deposits still debit the full 16.
        const need = Math.max(0, EXPERIMENTAL_BUDGET - getWorkshopPatronageAppliedGold(workshop.burgId, state.i, year));
        if (need > 0 && !debitTreasury(state.i, need)) {
          workshop.active = false;
          continue;
        }
        workshop.lastFundedYear = year;
        workshop.active = true;
      }

      const marketId = marketIdForBurg(workshop.burgId);
      consumeNamed(marketId, "Books", 0.1);
      consumeNamed(marketId, "Paper", 0.2);
      consumeNamed(marketId, "Ink", 0.1);
      const labGlass = consumeNamed(marketId, "Lab Glassware", 0.15);
      const glass = labGlass > 0 ? labGlass : consumeNamed(marketId, "Glass", 0.2);
      const tools = consumeNamed(marketId, "Tools", 0.1);
      const copper = consumeNamed(marketId, "Copper Ingot", 0.05);
      const obsidian = consumeNamed(marketId, "Obsidian", 0.02);
      const practice = getPracticeForState(state.i);
      const rate =
        0.15 * (1 + 0.15 * (practice?.pozzolanPractice ?? 0)) * (1 + 0.05 * (practice?.obsidianPractice ?? 0));
      const recordRate = biasExperimentRecordRate(rate, workshop.burgId);

      if (glass > 0 && tools > 0) {
        workshop.experimentRecord = rn(applyKnowledgeEwma(workshop.experimentRecord, 1, recordRate), 4);
        recordLabGlassPractice(state.i, year);
        upsertInstruments(workshop.burgId, RESEARCHERS + (copper > 0 ? 1 : 0));
        if (obsidian > 0) recordObsidianPractice(state.i, year);
      } else {
        workshop.experimentRecord = rn(applyKnowledgeEwma(workshop.experimentRecord, 0, 0.15), 4);
      }
    }

    setExperimentalWorkshops(workshops);
    return true;
  }
}

export const ExperimentalWorkshops = new ExperimentalWorkshopsModule();
