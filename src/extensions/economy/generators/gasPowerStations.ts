/**
 * Gas-fired power stations: the second fuel source (LNG instead of Coal) backing
 * gasFiredElectricityGeneration's demonstrated/adopted thresholds, feeding the same
 * generationCapacity pool PowerGridInvestment distributes as Market.electricityStock.
 * Design: docs/plan/natural-gas-lng-power-generation.md §3.9 — a precise duplicate of
 * powerStations.ts, minus the Firebrick input (a gas turbine has no furnace firebox to reline).
 */

import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getGasPowerStations,
  getSimulationYear,
  getWorldContext,
  setGasPowerStations,
  settleAnnualOnce
} from "../economyContext";
import {
  consumeNamed,
  debitTreasury,
  GAS_POWER_STATION_BUDGET,
  marketIdForBurg,
  pickSponsorBurg
} from "./chemMedCommon";
import { upsertInstruments } from "./experimentalWorkshops";

/** Same abstract unit as POWER_STATION_BASE_CAPACITY — gas-fired capacity is not privileged over
 *  coal-fired in this abstraction (§1 non-goal 3, docs/plan/natural-gas-lng-power-generation.md). */
export const GAS_POWER_STATION_BASE_CAPACITY = 2;
/** Same 4x trial/service ratio as PowerStation. */
const TRIAL_CAPACITY_FACTOR = 0.25;
/** Same order of magnitude as PowerStation's own instrument-worker contribution. */
const GAS_POWER_STATION_INSTRUMENT_WORKERS = 2;

export class GasPowerStationsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.gasPowerStations)) return false;

    const plants = [...getGasPowerStations()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("gasFiredElectricityGeneration", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let plant = plants.find(entry => entry.stateId === state.i && entry.active);
      if (!plant) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, GAS_POWER_STATION_BUDGET)) continue;
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

      if (!debitTreasury(state.i, GAS_POWER_STATION_BUDGET)) {
        plant.active = false;
        plant.lastFailureReason = "fundingCut";
        plant.generationCapacity = 0;
        continue;
      }
      plant.lastFundedYear = year;
      plant.active = true;

      const marketId = marketIdForBurg(plant.burgId);
      // Annual input scale: calibration TBD. LNG is the fuel — a denser/more fuel-efficient input
      // than Coal, so this plant consumes less of it per year (LNG 3 vs PowerStations' Coal 4).
      // Copper Wire/Machine Parts are wiring and turbine/generator parts, same as PowerStations.
      // No Firebrick — a gas turbine has no boiler firebox to reline.
      const lng = consumeNamed(marketId, "LNG", 3);
      const copperWire = consumeNamed(marketId, "Copper Wire", 1);
      const machineParts = consumeNamed(marketId, "Machine Parts", 1.5);
      const coverage = Math.min(1, lng / 3, copperWire / 1, machineParts / 1.5);
      plant.utilization = rn(Math.max(0, coverage), 4);

      if (plant.utilization >= 0.5) {
        plant.documentedRuns += 1;
        // generationCapacity is a flow recomputed every settled year, not accumulated like a Good
        // stock — PowerGridInvestment reads last year's value the following year, the same lag
        // PowerStations already has (§3.9).
        plant.generationCapacity = rn(
          GAS_POWER_STATION_BASE_CAPACITY * (plant.role === "trial" ? TRIAL_CAPACITY_FACTOR : 1) * plant.utilization,
          4
        );
        upsertInstruments(plant.burgId, GAS_POWER_STATION_INSTRUMENT_WORKERS);
      } else {
        plant.lastFailureReason = "materialShortage";
        plant.generationCapacity = 0;
      }
    }

    setGasPowerStations(plants);
    return true;
  }
}

export const GasPowerStations = new GasPowerStationsModule();
