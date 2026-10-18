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

import { getCellClimateNormals } from "../../hostCore";
import { getLatitude, getMonthlyMeanTemperaturesC, rn } from "../../hostUtils";
import {
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getSimulationMonth,
  getSimulationYear,
  getWorldContext
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { HeatingLedger, Market } from "./marketTypes";

/** Key that ties rural production's monthly Wood record to the same month's heating. */
export function getWoodSupplyMonthKey(): number {
  return getSimulationYear() * 12 + getSimulationMonth();
}

export const PEOPLE_PER_HEATING_MARKET_LOT = 1_000;
export const COMFORT_TEMPERATURE_C = 18;
export const BASE_HEATING_UNITS_PER_1000_RESIDENTS_MONTH = 0.16;
/**
 * calibration TBD — cooking fuel burned in every month and climate. A quarter of the coldest
 * month's heating: the hearth also cooked, so most cooking fuel is shared with heating in winter
 * and only becomes the whole fire in summer (docs/plan/farm-labour-calibration.md §19).
 */
export const BASE_COOKING_UNITS_PER_1000_RESIDENTS_MONTH = 0.04;
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

function getCellEffectiveTemperature(cellId: number): number | null {
  const world = getWorldContext();
  const gridCellId = world.pack.cells.g[cellId];
  const baseTemperature = world.grid.cells.temp?.[gridCellId];
  if (!Number.isFinite(baseTemperature)) return null;

  // Prefer the shared, already-computed seasonal grid (src/generators/seasonalClimate.ts).
  // Its "environment"-phase tick system always runs before this "economy"-phase settlement
  // within the same tick (see simulationPhases in src/generators/simulationSystem.ts), so it
  // is always fresh — reading it here avoids recomputing the same offset a second time.
  // Recomputing independently below is only a fallback for maps/saves where it hasn't been
  // computed yet.
  const sharedSeasonalTemperature = world.grid.cells.seasonalTemp?.[gridCellId];
  if (Number.isFinite(sharedSeasonalTemperature)) return sharedSeasonalTemperature as number;

  const point = world.pack.cells.p?.[cellId];
  if (!point) return baseTemperature;
  const latitude = getLatitude(point[1], world.mapCoordinates, world.graphHeight);
  const continentality = getCellClimateNormals(world, gridCellId, getSimulationYear())?.continentality ?? 0.5;
  return getMonthlyMeanTemperaturesC({
    annualMeanTemperatureC: baseTemperature,
    latitudeDeg: latitude,
    continentality,
    year: getSimulationYear(),
    axialTiltDeg: world.options.axialTilt
  })[getSimulationMonth() - 1];
}

type MarketResidents = {
  urbanPeople: number;
  ruralPeople: number;
  weightedTemperature: number;
  temperatureWeight: number;
};

/** Monthly household fuel need of one market territory, split by who supplies it. */
export type HouseholdFuelDemand = {
  populationLots: number;
  urbanLots: number;
  ruralLots: number;
  effectiveTemperature: number;
  /** Heating and cooking fuel of Burg residents; always drawn from market stock. */
  urbanDemand: number;
  /** Heating and cooking fuel of rural households; cut by themselves where forest allows. */
  ruralDemand: number;
};

function collectMarketResidents(): Map<number, MarketResidents> {
  const world = getWorldContext();
  const marketCells = getMarketCellColumn();
  const populationRate = Math.max(1, world.populationRate ?? 1);
  const urbanization = Math.max(0, world.urbanization ?? 1);
  const residents = new Map<number, MarketResidents>();
  const add = (marketId: number, cellId: number, people: number, urban: boolean) => {
    const entry = residents.get(marketId) ?? {
      urbanPeople: 0,
      ruralPeople: 0,
      weightedTemperature: 0,
      temperatureWeight: 0
    };
    if (urban) entry.urbanPeople += people;
    else entry.ruralPeople += people;
    residents.set(marketId, entry);
    const temperature = people > 0 ? getCellEffectiveTemperature(cellId) : null;
    if (temperature === null) return;
    entry.weightedTemperature += temperature * people;
    entry.temperatureWeight += people;
  };

  for (const burg of world.pack.burgs) {
    if (!burg?.i || burg.removed || !burg.market) continue;
    add(burg.market, burg.cell, Math.max(0, burg.population ?? 0) * populationRate * urbanization, true);
  }

  for (const cellId of world.pack.cells.i) {
    const marketId = marketCells[cellId];
    if (!marketId || world.pack.cells.h[cellId] < 20) continue;
    add(marketId, cellId, Math.max(0, world.pack.cells.pop[cellId] ?? 0) * populationRate, false);
  }
  return residents;
}

/**
 * Household fuel per 1,000 residents this month: space heating scaled by coldness and the
 * market's stove and insulation knowledge, plus cooking fuel that every household burns.
 */
function getFuelPerLot(ledger: HeatingLedger | undefined, effectiveTemperature: number): number {
  const coldness = Math.max(0, COMFORT_TEMPERATURE_C - effectiveTemperature) / COMFORT_TEMPERATURE_C;
  const fuelEfficiency = 1 - (ledger?.heatingTechnology ?? 0) * MAX_HEATING_TECH_FUEL_REDUCTION;
  const heatRetention = 1 - (ledger?.insulationTechnology ?? 0) * MAX_INSULATION_FUEL_REDUCTION;
  return (
    BASE_HEATING_UNITS_PER_1000_RESIDENTS_MONTH * coldness * fuelEfficiency * heatRetention +
    BASE_COOKING_UNITS_PER_1000_RESIDENTS_MONTH
  );
}

/** This month's household fuel need for every market, from one pass over burgs and cells. */
export function getMonthlyHouseholdFuelDemands(): Map<number, HouseholdFuelDemand> {
  const residents = collectMarketResidents();
  const demands = new Map<number, HouseholdFuelDemand>();
  for (const market of getMarkets()) {
    const entry = residents.get(market.i);
    const urbanLots = (entry?.urbanPeople ?? 0) / PEOPLE_PER_HEATING_MARKET_LOT;
    const ruralLots = (entry?.ruralPeople ?? 0) / PEOPLE_PER_HEATING_MARKET_LOT;
    const effectiveTemperature =
      entry && entry.temperatureWeight > 0 ? entry.weightedTemperature / entry.temperatureWeight : 18;
    const fuelPerLot = getFuelPerLot(market.heatingLedger, effectiveTemperature);
    demands.set(market.i, {
      populationLots: urbanLots + ruralLots,
      urbanLots,
      ruralLots,
      effectiveTemperature,
      urbanDemand: urbanLots * fuelPerLot,
      ruralDemand: ruralLots * fuelPerLot
    });
  }
  return demands;
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
 * Settles one month of household heating and cooking. Rural households first burn the Wood they
 * cut themselves this month (recorded by rural production in `market.woodSupply`); the rest of
 * the need draws on market stock. Wood is drawn first; Coal is a higher-energy fallback and
 * therefore only appears when local Wood is scarce.
 */
export function settleMonthlyHeating(): void {
  const wood = getGoods().find(good => good.name === "Wood" && isGoodEnabled(good));
  const coal = getGoods().find(good => good.name === "Coal" && isGoodEnabled(good));
  const monthKey = getWoodSupplyMonthKey();

  const demands = getMonthlyHouseholdFuelDemands();
  for (const market of getMarkets()) {
    const demand = demands.get(market.i);
    if (!demand) continue;
    const { populationLots, effectiveTemperature } = demand;
    const previous = market.heatingLedger ?? emptyLedger(populationLots, effectiveTemperature);
    const heatingDemand = demand.urbanDemand + demand.ruralDemand;
    const selfSuppliedWood =
      market.woodSupply?.monthKey === monthKey
        ? Math.min(demand.ruralDemand, Math.max(0, market.woodSupply.ruralFuelWood))
        : 0;

    const marketWood = drawFuel(market, wood?.i, heatingDemand - selfSuppliedWood);
    if (marketWood > 0 && wood) {
      recordGoodFlow({
        direction: "sink",
        category: "householdHeating",
        goodId: wood.i,
        units: marketWood,
        marketId: market.i
      });
    }
    const woodConsumption = selfSuppliedWood + marketWood;

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
      cumulativeUnmetHeating: rn(previous.cumulativeUnmetHeating + Math.max(0, heatingDemand - suppliedHeat), 4),
      selfSuppliedWood: rn(selfSuppliedWood, 4)
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

/**
 * calibration TBD — same order of magnitude as MAX_HEATING_TECH_FUEL_REDUCTION (0.25) and
 * raceWaterTechBias.ts's ceilingBonus.waterLifting (0.3): a real but bounded uplift, not a
 * multiplier that dwarfs the natural-geography baseline.
 */
export const MAX_HEATING_CLIMATE_CAPACITY_BONUS = 0.25;

/**
 * Raises a Burg's `demographics.effectiveCapacity` when its Market has real, accumulated
 * cold-climate knowledge (`heatingTechnology`/`insulationTechnology`, built up by
 * `settleAnnualColdClimateKnowledge()` above from years of actually surviving cold winters on
 * Wood/Coal). Before this, `settleMonthlyHeating()`'s fuel/comfort simulation had no connection at
 * all to the settlement-capacity ceiling: a State could burn Coal to keep a cold-climate Burg
 * warm for centuries and its population cap would behave exactly as if that never happened.
 *
 * No separate "is this Burg cold" gate is needed: heatingTechnology/insulationTechnology are
 * already near-zero for a temperate Burg, since `coldExposureMonths` (their upstream driver) only
 * accrues below COLD_EXPOSURE_TEMPERATURE_C — the bonus self-limits to places actually cold enough
 * for the knowledge to have built up.
 *
 * Must be called AFTER `foodImportNetwork.ts`'s `resolveFoodImportNetwork()` has finished its own
 * `resetEffectiveCapacities()` + `applyImportCapacity()` pass for this cycle — that function always
 * *reassigns* `effectiveCapacity` from `capacity` fresh (not an increment), so calling this first
 * would have its bonus silently discarded. `resolveFoodImportNetwork()` calls this itself, last.
 * Design: docs/plan/electric-power-and-telegraph.md §3.15.
 */
export function applyHeatingCapacityBonus(
  burgs: readonly {
    i?: number;
    removed?: boolean;
    market?: number;
    demographics?: { capacity: number; effectiveCapacity?: number };
  }[]
): void {
  for (const burg of burgs) {
    if (!burg?.i || burg.removed || !burg.demographics) continue;
    const ledger = getHeatingLedger(burg.market ?? 0);
    if (!ledger) continue;
    const climateKnowledge = clamp01((ledger.heatingTechnology + ledger.insulationTechnology) / 2);
    if (climateKnowledge <= 0) continue;
    const baseCapacity = Math.max(0, burg.demographics.capacity ?? 0);
    const current = burg.demographics.effectiveCapacity ?? baseCapacity;
    burg.demographics.effectiveCapacity = rn(
      current + baseCapacity * climateKnowledge * MAX_HEATING_CLIMATE_CAPACITY_BONUS,
      3
    );
  }
}
