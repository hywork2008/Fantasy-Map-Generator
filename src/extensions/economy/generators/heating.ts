/**
 * Household heating, fuel substitution, and cold-climate knowledge.
 *
 * Heating is settled after monthly production and trade. Wood is deliberately
 * the preferred fuel, while Coal only fills unmet heat demand. This keeps the
 * draw tied to the same market stock and standing-forest supply chain used by
 * construction and shipbuilding. Long-lived cold exposure builds local
 * forestry, heating, and insulation knowledge rather than granting it merely
 * from a map's latitude at generation time.
 */

import { getLatitude, getSeasonalTemperatureOffset, rn } from "../../hostUtils";
import {
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getSimulationDay,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { HeatingLedger, Market } from "./marketTypes";

export const PEOPLE_PER_HEATING_MARKET_LOT = 1_000;
export const COMFORT_TEMPERATURE_C = 18;
export const BASE_HEATING_UNITS_PER_1000_RESIDENTS_MONTH = 0.16;
export const COAL_HEAT_PER_UNIT = 2.5;
export const MAX_HEATING_TECH_FUEL_REDUCTION = 0.25;
export const MAX_INSULATION_FUEL_REDUCTION = 0.35;
export const MAX_MANAGED_FOREST_REGROWTH_BONUS = 0.5;

const COLD_EXPOSURE_TEMPERATURE_C = 8;
const COLD_EXPOSURE_MONTHS_FOR_MATURE_KNOWLEDGE = 36;
const KNOWLEDGE_ADOPTION_RATE = 0.16;
const KNOWLEDGE_DECAY_RATE = 0.025;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function emptyLedger(populationLots: number, effectiveTemperature: number): HeatingLedger {
  return {
    populationLots,
    effectiveTemperature,
    heatingDemand: 0,
    woodConsumption: 0,
    coalConsumption: 0,
    unmetHeating: 0,
    coalSmokeExposure: 0,
    coldExposureMonths: 0,
    forestryKnowledge: 0,
    heatingTechnology: 0,
    insulationTechnology: 0,
    cumulativeWoodConsumption: 0,
    cumulativeCoalConsumption: 0,
    cumulativeUnmetHeating: 0
  };
}

function getClimateOptions() {
  const options = getWorldContext().options;
  return {
    temperatureEquator: options.temperatureEquator ?? 30,
    temperatureNorthPole: options.temperatureNorthPole ?? -20,
    temperatureSouthPole: options.temperatureSouthPole ?? -20
  };
}

function getCellEffectiveTemperature(cellId: number): number | null {
  const world = getWorldContext();
  const gridCellId = world.pack.cells.g[cellId];
  const baseTemperature = world.grid.cells.temp?.[gridCellId];
  if (!Number.isFinite(baseTemperature)) return null;

  const point = world.pack.cells.p?.[cellId];
  if (!point) return baseTemperature;
  const latitude = getLatitude(point[1], world.mapCoordinates, world.graphHeight);
  return (
    baseTemperature +
    getSeasonalTemperatureOffset(
      latitude,
      getSimulationYear(),
      getSimulationMonth(),
      getSimulationDay(),
      getClimateOptions(),
      world.options.axialTilt
    )
  );
}

function getMarketPopulationAndTemperature(marketId: number): { populationLots: number; effectiveTemperature: number } {
  const world = getWorldContext();
  const marketCells = getMarketCellColumn();
  const populationRate = Math.max(1, world.populationRate ?? 1);
  const urbanization = Math.max(0, world.urbanization ?? 1);
  let people = 0;
  let weightedTemperature = 0;
  let temperatureWeight = 0;

  for (const burg of world.pack.burgs) {
    if (!burg?.i || burg.removed || burg.market !== marketId) continue;
    const population = Math.max(0, burg.population ?? 0) * populationRate * urbanization;
    people += population;
    const temperature = getCellEffectiveTemperature(burg.cell);
    if (temperature === null || population <= 0) continue;
    weightedTemperature += temperature * population;
    temperatureWeight += population;
  }

  for (const cellId of world.pack.cells.i) {
    if (world.pack.cells.h[cellId] < 20 || marketCells[cellId] !== marketId) continue;
    const population = Math.max(0, world.pack.cells.pop[cellId] ?? 0) * populationRate;
    people += population;
    const temperature = getCellEffectiveTemperature(cellId);
    if (temperature === null || population <= 0) continue;
    weightedTemperature += temperature * population;
    temperatureWeight += population;
  }

  return {
    populationLots: people / PEOPLE_PER_HEATING_MARKET_LOT,
    effectiveTemperature: temperatureWeight > 0 ? weightedTemperature / temperatureWeight : 18
  };
}

function drawFuel(market: Market, goodId: number | undefined, requested: number): number {
  if (goodId === undefined || requested <= 0) return 0;
  const row = market.goods[goodId];
  if (!row || row.stock <= 0) return 0;
  const consumed = Math.min(requested, Math.max(0, row.stock));
  row.stock = rn(Math.max(0, row.stock - consumed), 4);
  return consumed;
}

/** Returns the persisted heating record for a market, if it has settled at least once. */
export function getHeatingLedger(marketId: number): HeatingLedger | undefined {
  return getMarkets().find(market => market.i === marketId)?.heatingLedger;
}

/**
 * Settles one month of household heating. Wood is drawn first; Coal is a
 * higher-energy fallback and therefore only appears when local Wood is scarce.
 */
export function settleMonthlyHeating(): void {
  const wood = getGoods().find(good => good.name === "Wood" && isGoodEnabled(good));
  const coal = getGoods().find(good => good.name === "Coal" && isGoodEnabled(good));

  for (const market of getMarkets()) {
    const { populationLots, effectiveTemperature } = getMarketPopulationAndTemperature(market.i);
    const previous = market.heatingLedger ?? emptyLedger(populationLots, effectiveTemperature);
    const coldness = Math.max(0, COMFORT_TEMPERATURE_C - effectiveTemperature) / COMFORT_TEMPERATURE_C;
    const fuelEfficiency = 1 - previous.heatingTechnology * MAX_HEATING_TECH_FUEL_REDUCTION;
    const heatRetention = 1 - previous.insulationTechnology * MAX_INSULATION_FUEL_REDUCTION;
    const heatingDemand =
      populationLots * BASE_HEATING_UNITS_PER_1000_RESIDENTS_MONTH * coldness * fuelEfficiency * heatRetention;

    const woodConsumption = drawFuel(market, wood?.i, heatingDemand);
    if (woodConsumption > 0 && wood) {
      recordGoodFlow({
        direction: "sink",
        category: "householdHeating",
        goodId: wood.i,
        units: woodConsumption,
        marketId: market.i
      });
    }

    const heatStillNeeded = Math.max(0, heatingDemand - woodConsumption);
    const coalConsumption = drawFuel(market, coal?.i, heatStillNeeded / COAL_HEAT_PER_UNIT);
    if (coalConsumption > 0 && coal) {
      recordGoodFlow({
        direction: "sink",
        category: "householdHeating",
        goodId: coal.i,
        units: coalConsumption,
        marketId: market.i
      });
    }

    const suppliedHeat = woodConsumption + coalConsumption * COAL_HEAT_PER_UNIT;
    const coalHeatShare = heatingDemand > 0 ? Math.min(1, (coalConsumption * COAL_HEAT_PER_UNIT) / heatingDemand) : 0;
    const coalSmokeExposure = clamp01(coalHeatShare * (1 - previous.heatingTechnology * 0.25));
    const coldExposureMonths =
      effectiveTemperature < COLD_EXPOSURE_TEMPERATURE_C
        ? previous.coldExposureMonths + 1
        : Math.max(0, previous.coldExposureMonths - 0.25);

    market.heatingLedger = {
      ...previous,
      populationLots: rn(populationLots, 4),
      effectiveTemperature: rn(effectiveTemperature, 2),
      heatingDemand: rn(heatingDemand, 4),
      woodConsumption: rn(woodConsumption, 4),
      coalConsumption: rn(coalConsumption, 4),
      unmetHeating: rn(Math.max(0, heatingDemand - suppliedHeat), 4),
      coalSmokeExposure: rn(coalSmokeExposure, 4),
      coldExposureMonths: rn(coldExposureMonths, 2),
      cumulativeWoodConsumption: rn(previous.cumulativeWoodConsumption + woodConsumption, 4),
      cumulativeCoalConsumption: rn(previous.cumulativeCoalConsumption + coalConsumption, 4),
      cumulativeUnmetHeating: rn(previous.cumulativeUnmetHeating + Math.max(0, heatingDemand - suppliedHeat), 4)
    };
  }
}

/** Advances territory-specific knowledge once per calendar year. */
export function settleAnnualColdClimateKnowledge(): void {
  const year = getSimulationYear();
  for (const market of getMarkets()) {
    const previous = market.heatingLedger;
    if (!previous || previous.lastKnowledgeYear === year) continue;

    const coldExperience = clamp01(previous.coldExposureMonths / COLD_EXPOSURE_MONTHS_FOR_MATURE_KNOWLEDGE);
    const suppliedHeat = previous.woodConsumption + previous.coalConsumption * COAL_HEAT_PER_UNIT;
    const woodReliance = suppliedHeat > 0 ? clamp01(previous.woodConsumption / suppliedHeat) : 0;
    const hardship = previous.heatingDemand > 0 ? clamp01(previous.unmetHeating / previous.heatingDemand) : 0;
    const evolve = (stock: number, target: number) =>
      rn(stock * (1 - KNOWLEDGE_DECAY_RATE) + clamp01(target) * KNOWLEDGE_ADOPTION_RATE, 4);

    market.heatingLedger = {
      ...previous,
      forestryKnowledge: evolve(previous.forestryKnowledge, coldExperience * Math.max(0.2, woodReliance)),
      heatingTechnology: evolve(previous.heatingTechnology, coldExperience * (0.7 + hardship * 0.3)),
      insulationTechnology: evolve(previous.insulationTechnology, coldExperience * (0.65 + hardship * 0.35)),
      lastKnowledgeYear: year
    };
  }
}

/** Managed forestry only accelerates recovery in the inhabited market territory that developed it. */
export function getForestRegrowthMultiplier(cellId: number): number {
  const marketId = getMarketCellColumn()[cellId];
  const forestryKnowledge = getHeatingLedger(marketId)?.forestryKnowledge ?? 0;
  return 1 + clamp01(forestryKnowledge) * MAX_MANAGED_FOREST_REGROWTH_BONUS;
}
