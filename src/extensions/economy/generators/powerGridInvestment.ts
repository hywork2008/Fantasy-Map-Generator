import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getDams,
  getGasPowerStations,
  getMarkets,
  getPowerStations,
  getWorldContext,
  settleAnnualOnce
} from "../economyContext";
import { marketIdForBurg } from "./chemMedCommon";

/**
 * Distributes PowerStation (and electrified Dam, docs/plan/dam-flood-control-and-hydropower.md §3)
 * generation capacity to markets as Market.electricityStock — a population-demand coverage EWMA,
 * not a market Good purchase. Same "Market-funded annual investment -> EWMA" shape as
 * fertilizerInvestment.ts, but the supply side is PowerStation/Dam capacity (§3.9) instead of a
 * Good purchased via Markets.consumeForMarketInvestment, and the demand basis is population
 * instead of cultivated area. Does not touch market.marketTreasury — the capital/operating cost of
 * electricity is already paid by PowerStations.settleAnnual()/Dams.settleAnnual(); this module
 * only allocates the capacity that produced.
 * Design: docs/plan/electric-power-and-telegraph.md §3.10.
 */

/** calibration TBD — annual target generation capacity per 1000 population for full (1.0)
 *  coverage, in the same abstract unit as PowerStation.generationCapacity. */
export const TARGET_ELECTRICITY_PER_1000_POPULATION = 0.4;
/** Same EWMA speed as FERTILIZER_ADOPTION_RATE/NITROGEN_FERTILIZER_ADOPTION_RATE. */
export const ELECTRICITY_ADOPTION_RATE = 0.15;

export class PowerGridInvestmentModule {
  /**
   * Runs at most once per simulation year. Reads PowerStation.generationCapacity as it stood
   * after last year's PowerStations.settleAnnual() — that module runs later in the same tick (the
   * era-6 plant block in index.tsx), so this year's PowerStations output is read by next year's
   * call, the same one-year lag NitrogenFertilizerInvestment already has relative to
   * SyntheticAmmoniaPlants.
   */
  settleAnnual(): boolean {
    if (!settleAnnualOnce(ANNUAL_GATE.powerGridInvestment)) return false;

    const pack = getWorldContext().pack;
    const burgs = pack.burgs ?? [];

    // Market has no population field of its own — same aggregation
    // Markets.calculatePopulationByMarket() does internally (markets-generator.ts, private),
    // duplicated locally per fertilizerInvestment.ts's "recompute per module" convention.
    const populationByMarket = new Map<number, number>();
    for (const burg of burgs) {
      if (!burg?.i || burg.removed || !burg.market) continue;
      const pop = Math.max(0, Number(burg.population) || 0);
      if (pop <= 0) continue;
      populationByMarket.set(burg.market, (populationByMarket.get(burg.market) ?? 0) + pop);
    }

    // PowerStation capacity, grouped both by its own market (pre-powerGrid supply) and by owning
    // state (the state-wide pool powerGrid's adopted stage unlocks).
    const capacityByMarket = new Map<number, number>();
    const capacityByState = new Map<number, number>();
    for (const plant of getPowerStations()) {
      if (!plant.active) continue;
      const marketId = marketIdForBurg(plant.burgId);
      if (marketId) capacityByMarket.set(marketId, (capacityByMarket.get(marketId) ?? 0) + plant.generationCapacity);
      if (plant.stateId) {
        capacityByState.set(plant.stateId, (capacityByState.get(plant.stateId) ?? 0) + plant.generationCapacity);
      }
    }
    // GasPowerStation joins the same pool as coal PowerStations — the "later oil/gas energy
    // supply" roadmap §9.3 promises. docs/plan/natural-gas-lng-power-generation.md §3.10.
    for (const plant of getGasPowerStations()) {
      if (!plant.active) continue;
      const marketId = marketIdForBurg(plant.burgId);
      if (marketId) capacityByMarket.set(marketId, (capacityByMarket.get(marketId) ?? 0) + plant.generationCapacity);
      if (plant.stateId) {
        capacityByState.set(plant.stateId, (capacityByState.get(plant.stateId) ?? 0) + plant.generationCapacity);
      }
    }
    // Electrified Dams join the same pool as coal PowerStations — an unelectrified Dam has
    // generationCapacity 0 (dams.ts), so this is a no-op for States without generatorAndMotor.
    for (const dam of getDams()) {
      if (!dam.active || !dam.electrified) continue;
      const marketId = marketIdForBurg(dam.burgId);
      if (marketId) capacityByMarket.set(marketId, (capacityByMarket.get(marketId) ?? 0) + dam.generationCapacity);
      if (dam.stateId) {
        capacityByState.set(dam.stateId, (capacityByState.get(dam.stateId) ?? 0) + dam.generationCapacity);
      }
    }

    const markets = getMarkets();
    const stateIdByMarket = new Map<number, number>();
    const populationByState = new Map<number, number>();
    for (const market of markets) {
      const center = burgs[market.centerBurgId];
      const stateId = center && !center.removed ? (center.state ?? 0) : 0;
      if (!stateId) continue;
      stateIdByMarket.set(market.i, stateId);
      const population = populationByMarket.get(market.i) ?? 0;
      populationByState.set(stateId, (populationByState.get(stateId) ?? 0) + population);
    }

    for (const market of markets) {
      const population = populationByMarket.get(market.i) ?? 0;
      const previousStock = market.electricityStock ?? 0;

      if (population <= 0) {
        // No population to serve; let existing coverage decay toward 0 rather than freezing it.
        market.electricityStock = rn(previousStock * (1 - ELECTRICITY_ADOPTION_RATE), 4);
        continue;
      }

      const stateId = stateIdByMarket.get(market.i) ?? 0;
      const gridAdopted = stateId > 0 && isTechnologyStageAtLeast(getTechnologyStage("powerGrid", stateId), "adopted");

      let availableSupply: number;
      if (gridAdopted) {
        // Pooled across the whole State once powerGrid is adopted, shared by population share —
        // the "Burg 間の電力供給" (inter-Burg power supply) effect from roadmap §9.3.
        const stateCapacity = capacityByState.get(stateId) ?? 0;
        const statePopulation = populationByState.get(stateId) ?? 0;
        availableSupply = statePopulation > 0 ? stateCapacity * (population / statePopulation) : 0;
      } else {
        // Before powerGrid: only PowerStations sharing this exact market can serve it.
        availableSupply = capacityByMarket.get(market.i) ?? 0;
      }

      const requestedUnits = (population / 1000) * TARGET_ELECTRICITY_PER_1000_POPULATION;
      const coverageThisYear = requestedUnits > 0 ? Math.min(1, availableSupply / requestedUnits) : 0;
      market.electricityStock = rn(
        previousStock * (1 - ELECTRICITY_ADOPTION_RATE) + coverageThisYear * ELECTRICITY_ADOPTION_RATE,
        4
      );
    }

    return true;
  }
}

export const PowerGridInvestment = new PowerGridInvestmentModule();
