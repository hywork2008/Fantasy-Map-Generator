/**
 * Coal-fired power stations: a State-funded capital asset that backs generatorAndMotor's
 * demonstrated/adopted thresholds and produces the generation capacity PowerGridInvestment
 * distributes to markets as Market.electricityStock.
 * Design: docs/plan/electric-power-and-telegraph.md §3.9 — same shape as steelConverters.ts,
 * minus a market Good output (Electricity is a capacity service, not a stock Good; see §7
 * decision 1: no purchasable "Generator" Good, following the SteelConverterPlant/SteamInstallation
 * precedent instead of steam-industrial-goods-and-technology-chain.md's original capital-Good
 * concept).
 */

import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  getPowerStations,
  getPowerStationsLastSettledYear,
  getSimulationYear,
  getWorldContext,
  setPowerStations,
  setPowerStationsLastSettledYear
} from "../economyContext";
import { consumeNamed, debitTreasury, marketIdForBurg, POWER_STATION_BUDGET, pickSponsorBurg } from "./chemMedCommon";
import { upsertInstruments } from "./experimentalWorkshops";

/**
 * calibration TBD — abstract generation-capacity unit a single fully-utilized "service" plant
 * produces. PowerGridInvestment's TARGET_ELECTRICITY_PER_1000_POPULATION is calibrated against
 * this same unit.
 */
export const POWER_STATION_BASE_CAPACITY = 2;
/** calibration TBD — trial-role plants run at a quarter scale, same 4x trial/service ratio as
 *  SteelConverterPlant's 0.6/2.4 output pair. */
const TRIAL_CAPACITY_FACTOR = 0.25;
/** calibration TBD — same order of magnitude as ExperimentalWorkshops' RESEARCHERS(2). */
const POWER_STATION_INSTRUMENT_WORKERS = 2;

export class PowerStationsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getPowerStationsLastSettledYear() === year) return false;
    setPowerStationsLastSettledYear(year);

    const plants = [...getPowerStations()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("generatorAndMotor", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let plant = plants.find(entry => entry.stateId === state.i && entry.active);
      if (!plant) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, POWER_STATION_BUDGET)) continue;
        plant = {
          burgId,
          stateId: state.i,
          role: "trial",
          active: true,
          utilization: 0,
          documentedRuns: 0,
          lastFundedYear: year,
          generationCapacity: 0
        };
        plants.push(plant);
      } else if (isTechnologyStageAtLeast(stage, "adopted") && plant.role === "trial") {
        plant.role = "service";
      }

      if (!debitTreasury(state.i, POWER_STATION_BUDGET)) {
        plant.active = false;
        plant.lastFailureReason = "fundingCut";
        plant.generationCapacity = 0;
        continue;
      }
      plant.lastFundedYear = year;
      plant.active = true;

      const marketId = marketIdForBurg(plant.burgId);
      // Annual input scale: calibration TBD. Coal is the fuel; Copper Wire/Machine Parts are
      // wiring and turbine/generator parts consumed as ongoing maintenance and expansion stock.
      // Firebrick relines the boiler firebox — same ongoing-consumable shape as the others.
      const coal = consumeNamed(marketId, "Coal", 4);
      const copperWire = consumeNamed(marketId, "Copper Wire", 1);
      const machineParts = consumeNamed(marketId, "Machine Parts", 1.5);
      const firebrick = consumeNamed(marketId, "Firebrick", 0.3);
      const coverage = Math.min(1, coal / 4, copperWire / 1, machineParts / 1.5, firebrick / 0.3);
      plant.utilization = rn(Math.max(0, coverage), 4);

      if (plant.utilization >= 0.5) {
        plant.documentedRuns += 1;
        // generationCapacity is a flow recomputed every settled year, not accumulated like a Good
        // stock (§3.9) — PowerGridInvestment reads last year's value the following year (the same
        // one-year-lag relationship NitrogenFertilizerInvestment already has with
        // SyntheticAmmoniaPlants; see the call order comment in index.tsx).
        plant.generationCapacity = rn(
          POWER_STATION_BASE_CAPACITY * (plant.role === "trial" ? TRIAL_CAPACITY_FACTOR : 1) * plant.utilization,
          4
        );
        upsertInstruments(plant.burgId, POWER_STATION_INSTRUMENT_WORKERS);
      } else {
        plant.lastFailureReason = "materialShortage";
        plant.generationCapacity = 0;
      }
    }

    setPowerStations(plants);
    return true;
  }
}

export const PowerStations = new PowerStationsModule();
