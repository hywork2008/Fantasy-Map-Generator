/**
 * Chlor-alkali electrolysis plants: a THIRD supply route for the existing Chlorine and Caustic
 * Soda Goods, electrolyzing Salt (brine) directly into both — no Sulfuric Acid, no Coal, unlike
 * the Deacon-process ChlorinePlants (chlorinePlants.ts). Reuses the electrolyticIndustry gate
 * ElectrolysisPlants already established (electrolytic-industry-vertical-slice.md §7 decision 1
 * precedent: does not fork a new technology node when the underlying electrolytic-chemistry
 * know-how substantially overlaps an existing one).
 * The first true co-product module in the economy — one settleAnnual() run can write stock to
 * two named Goods from a single reaction (§3.1).
 * Design: docs/plan/chlor-alkali-electrolysis-vertical-slice.md §3.7.
 */

import { getTechnologyProgressEntries, getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getChlorAlkaliPlants,
  getSimulationYear,
  getWorldContext,
  setChlorAlkaliPlants,
  settleAnnualOnce
} from "../economyContext";
import {
  addNamedStock,
  CHLOR_ALKALI_PLANT_BUDGET,
  consumeNamed,
  debitTreasury,
  electricityCoverageForMarket,
  marketIdForBurg,
  pickSponsorBurg
} from "./chemMedCommon";

/**
 * Output only starts once the world knows the underlying chemistry for each co-product Good —
 * same "trial can start early, output waits for the groundwork" structure as AcidPlants'
 * worldHasFoundation()/PhosphateFertilizerPlants' worldHasIndustrialSulfuricAcid()/ChlorinePlants'
 * own worldHasCatalyticChemistry(). Two separate checks, not one, because Chlorine's
 * requiredTechnology (catalyticChemistry) and Caustic Soda's (chemicalIndustryFoundation) differ
 * from each other AND from this plant's own creation gate (electrolyticIndustry) — unlike
 * ElectrolysisPlants/Aluminum, where the plant gate and the Good gate are the same node.
 */
function worldHasCatalyticChemistry(): boolean {
  return getTechnologyProgressEntries().some(
    entry => entry.technologyId === "catalyticChemistry" && isTechnologyStageAtLeast(entry.stage, "demonstrated")
  );
}

function worldHasChemicalIndustryFoundation(): boolean {
  return getTechnologyProgressEntries().some(
    entry =>
      entry.technologyId === "chemicalIndustryFoundation" && isTechnologyStageAtLeast(entry.stage, "demonstrated")
  );
}

export class ChlorAlkaliPlantsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.chlorAlkaliPlants)) return false;

    const plants = [...getChlorAlkaliPlants()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("electrolyticIndustry", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let plant = plants.find(entry => entry.stateId === state.i && entry.active);
      if (!plant) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, CHLOR_ALKALI_PLANT_BUDGET)) continue;
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

      if (!debitTreasury(state.i, CHLOR_ALKALI_PLANT_BUDGET)) {
        plant.active = false;
        plant.lastFailureReason = "fundingCut";
        continue;
      }
      plant.lastFundedYear = year;
      plant.active = true;

      const marketId = marketIdForBurg(plant.burgId);
      // Brine electrolysis: 2 NaCl + 2 H2O --(electricity)--> Cl2 + H2 + 2 NaOH. No Sulfuric
      // Acid, no Coal — electricity substitutes for ChlorinePlants' Deacon-process thermal/
      // chemical inputs (the entire point of this route, §3.1). Firebrick stands in for the cell
      // lining/diaphragm material, same light draw as ChlorinePlants' own catalyst-bed lining.
      // Salt scale matches ChlorinePlants' own Salt draw (same bulk-chemical order of magnitude).
      const salt = consumeNamed(marketId, "Salt", 0.5);
      const firebrick = consumeNamed(marketId, "Firebrick", 0.05);
      const materialCoverage = Math.min(1, salt / 0.5, firebrick / 0.05);
      const powerCoverage = electricityCoverageForMarket(marketId);
      const coverage = Math.min(materialCoverage, powerCoverage);
      plant.utilization = rn(Math.max(0, coverage), 4);

      if (plant.utilization >= 0.5) {
        plant.documentedRuns += 1;
        // Co-product output: mass ratio Cl2:NaOH ~ 70.9:80 ~ 1:1.13. Trial/service scale matches
        // the sibling modules' 4x jump (ChlorinePlants 0.15/0.6, ElectrolysisPlants 0.1/0.4). Each
        // output is independently gated on its own Good's underlying world chemistry (see
        // worldHasCatalyticChemistry/worldHasChemicalIndustryFoundation above) — the electrolysis
        // reaction "running" (utilization, documentedRuns) is independent of whether either
        // product is yet a recognized market Good.
        if (worldHasCatalyticChemistry()) {
          addNamedStock(marketId, "Chlorine", plant.role === "trial" ? 0.15 : 0.6);
        }
        if (worldHasChemicalIndustryFoundation()) {
          addNamedStock(marketId, "Caustic Soda", plant.role === "trial" ? 0.17 : 0.68);
        }
      } else if (powerCoverage < materialCoverage) {
        plant.lastFailureReason = "powerShortage";
      } else {
        plant.lastFailureReason = "materialShortage";
      }
    }

    setChlorAlkaliPlants(plants);
    return true;
  }
}

export const ChlorAlkaliPlants = new ChlorAlkaliPlantsModule();
