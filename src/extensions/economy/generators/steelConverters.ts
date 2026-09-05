/**
 * Bessemer-converter steel plants: a second, State-funded supply route for the existing `Steel`
 * Good, running alongside its unchanged artisanal recipe (goods-generator.ts).
 * Design: docs/plan/modern-steelmaking-and-high-pressure-apparatus.md §3.2 — same shape as
 * acidPlants.ts/phosphateFertilizerPlants.ts, minus the ChemistryTrial indirection those use
 * (§7 decision 2: SteelConverterPlant holds documentedRuns on itself, HospitalInstallation-style).
 */

import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getSimulationYear,
  getSteelConverterPlants,
  getWorldContext,
  setSteelConverterPlants,
  settleAnnualOnce
} from "../economyContext";
import {
  addNamedStock,
  consumeNamed,
  debitTreasury,
  FACILITY_MAINTENANCE_RATE,
  marketIdForBurg,
  pickSponsorBurg
} from "./chemMedCommon";

/**
 * calibration TBD — higher than ACID_PLANT_BUDGET (24) / PHOSPHATE_FERTILIZER_PLANT_BUDGET (28):
 * a Bessemer converter is a larger capital installation than either chemical plant.
 */
export const STEEL_CONVERTER_PLANT_BUDGET = 32;

export class SteelConvertersModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.steelConverterPlants)) return false;

    const plants = [...getSteelConverterPlants()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("modernSteelmaking", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let plant = plants.find(entry => entry.stateId === state.i && entry.active);
      if (!plant) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, STEEL_CONVERTER_PLANT_BUDGET)) continue;
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

      if (!debitTreasury(state.i, rn(STEEL_CONVERTER_PLANT_BUDGET * FACILITY_MAINTENANCE_RATE, 2))) {
        plant.active = false;
        plant.lastFailureReason = "fundingCut";
        continue;
      }
      plant.lastFundedYear = year;
      plant.active = true;

      const marketId = marketIdForBurg(plant.burgId);
      // Annual input scale: 3x the existing craft recipe's per-unit ratio (Iron Ingot 1 : Coke
      // 0.6 : Lime 0.2 — goods-generator.ts), a bulk-production scale-up. Calibration TBD.
      // Firebrick relines the converter vessel; a Bessemer/open-hearth lining wears faster than
      // a boiler firebox (PowerStations' 0.3), so this draws at the same rate as Lime.
      const ironIngot = consumeNamed(marketId, "Iron Ingot", 3);
      const coke = consumeNamed(marketId, "Coke", 1.8);
      const lime = consumeNamed(marketId, "Lime", 0.6);
      const firebrick = consumeNamed(marketId, "Firebrick", 0.6);
      const coverage = Math.min(1, ironIngot / 3, coke / 1.8, lime / 0.6, firebrick / 0.6);
      plant.utilization = rn(Math.max(0, coverage), 4);

      if (plant.utilization >= 0.5) {
        plant.documentedRuns += 1;
        // Same "trial is small-scale, service is full-scale" 4x ratio as AcidPlant's 0.15/0.6
        // and PhosphateFertilizerPlant's 0.2/0.8, scaled up for bulk steel. Calibration TBD.
        addNamedStock(marketId, "Steel", plant.role === "trial" ? 0.6 : 2.4);
      } else {
        plant.lastFailureReason = "materialShortage";
      }
    }

    setSteelConverterPlants(plants);
    return true;
  }
}

export const SteelConverters = new SteelConvertersModule();
