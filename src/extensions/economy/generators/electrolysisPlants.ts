/**
 * Electrolytic reduction plants: the sole supply route for the Aluminum Good, and the first
 * State capital equipment whose utilization is also capped by Market.electricityStock coverage
 * (not just Good stock). Same shape as steelConverters.ts, plus the electricity-coverage cap.
 * Design: docs/plan/electrolytic-industry-vertical-slice.md §3.7.
 */

import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  getElectrolysisPlants,
  getElectrolysisPlantsLastSettledYear,
  getSimulationYear,
  getWorldContext,
  setElectrolysisPlants,
  setElectrolysisPlantsLastSettledYear
} from "../economyContext";
import {
  addNamedStock,
  consumeNamed,
  debitTreasury,
  ELECTROLYSIS_PLANT_BUDGET,
  electricityCoverageForMarket,
  marketIdForBurg,
  pickSponsorBurg
} from "./chemMedCommon";

export class ElectrolysisPlantsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getElectrolysisPlantsLastSettledYear() === year) return false;
    setElectrolysisPlantsLastSettledYear(year);

    const plants = [...getElectrolysisPlants()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("electrolyticIndustry", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let plant = plants.find(entry => entry.stateId === state.i && entry.active);
      if (!plant) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, ELECTROLYSIS_PLANT_BUDGET)) continue;
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

      if (!debitTreasury(state.i, ELECTROLYSIS_PLANT_BUDGET)) {
        plant.active = false;
        plant.lastFailureReason = "fundingCut";
        continue;
      }
      plant.lastFundedYear = year;
      plant.active = true;

      const marketId = marketIdForBurg(plant.burgId);
      // Annual input scale: calibration TBD. Alumina:Aluminum ~2:1 mirrors the real mass ratio.
      // Coke stands in for carbon anode consumption; Firebrick for cell-lining/flux wear — the
      // same "furnace/reactor lining" proxy AcidPlants/SteelConverters/ChlorinePlants/
      // PowerStations already share (§3.1).
      const alumina = consumeNamed(marketId, "Alumina", 2);
      const coke = consumeNamed(marketId, "Coke", 0.4);
      const firebrick = consumeNamed(marketId, "Firebrick", 0.3);
      const materialCoverage = Math.min(1, alumina / 2, coke / 0.4, firebrick / 0.3);
      // The novel constraint (§3.7, roadmap §9.4 "電力不足で停止・減産する"): utilization can
      // never exceed the local Market.electricityStock capacity coverage, regardless of how
      // plentiful the material inputs are.
      const powerCoverage = electricityCoverageForMarket(marketId);
      const coverage = Math.min(materialCoverage, powerCoverage);
      plant.utilization = rn(Math.max(0, coverage), 4);

      if (plant.utilization >= 0.5) {
        plant.documentedRuns += 1;
        // Trial/service output ratio same 4x scale as ChlorinePlants' 0.15/0.6, set lower in
        // absolute terms — Aluminum is a high-value, low-bulk metal (§3.7).
        addNamedStock(marketId, "Aluminum", plant.role === "trial" ? 0.1 : 0.4);
      } else if (powerCoverage < materialCoverage) {
        plant.lastFailureReason = "powerShortage";
      } else {
        plant.lastFailureReason = "materialShortage";
      }
    }

    setElectrolysisPlants(plants);
    return true;
  }
}

export const ElectrolysisPlants = new ElectrolysisPlantsModule();
