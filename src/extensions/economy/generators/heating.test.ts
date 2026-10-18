import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  initEconomyContext,
  setBurgMarketLedgers,
  setGoods,
  setMarketCellColumn,
  setMarkets
} from "../economyContext";
import { getHouseholdWealth } from "./burgMarketLedgers";
import {
  applyHeatingCapacityBonus,
  BASE_COOKING_UNITS_PER_1000_RESIDENTS_MONTH,
  getForestRegrowthMultiplier,
  getWoodSupplyMonthKey,
  MAX_HEATING_CLIMATE_CAPACITY_BONUS,
  settleAnnualColdClimateKnowledge,
  settleMonthlyHeating
} from "./heating";
import { getRuralHouseholdWealth } from "./householdWealth";
import { healthPressureFromSanitation } from "./urbanWaterInstitutions";

function installMarket(temperature: number, woodStock: number, coalStock: number, householdWealth = 1_000_000): void {
  worldContext.populationRate = 1_000;
  worldContext.urbanization = 1;
  worldContext.grid = { cells: { temp: Int8Array.from([temperature]) } } as typeof worldContext.grid;
  worldContext.pack = {
    burgs: [undefined, { i: 1, cell: 0, market: 1, population: 2, state: 1, removed: false }],
    states: [undefined, { i: 1, capital: 1 }],
    cells: {
      i: [0],
      g: Uint16Array.from([0]),
      h: Uint8Array.from([55]),
      pop: Float32Array.from([98])
    }
  } as unknown as PackedGraph;
  setMarketCellColumn(Uint16Array.from([1]));
  setGoods([
    { i: 1, name: "Wood", value: 1, tags: ["fuel"], unit: "pile", icon: "", color: "" },
    { i: 2, name: "Coal", value: 1, tags: ["fuel"], unit: "pile", icon: "", color: "" }
  ]);
  setMarkets([
    {
      i: 1,
      centerBurgId: 1,
      color: "#fff",
      goods: { 1: { stock: woodStock, price: 1 }, 2: { stock: coalStock, price: 1 } }
    }
  ]);
  setBurgMarketLedgers([{ burgId: 1, marketId: 1, merchants: [], householdWealth }]);
}

describe("household heating", () => {
  beforeEach(() => {
    simulationContext.currentYear = 1000;
    simulationContext.currentMonth = 1;
    simulationContext.currentDay = 1;
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  it("prefers the shared grid.cells.seasonalTemp over recomputing its own seasonal offset", () => {
    installMarket(-10, 100_000, 100_000);
    // A deliberately distinguishable value: neither the annual-average base temp (-10) nor
    // anything a fresh getSeasonalTemperatureOffset() computation on this fixture (no
    // pack.cells.p, so it falls back to baseTemperature) could produce.
    worldContext.grid.cells.seasonalTemp = Int8Array.from([5]);

    settleMonthlyHeating();

    expect(getMarkets()[0].heatingLedger?.effectiveTemperature).toBe(5);
  });

  it("draws substantially more Wood in a cold market than in a warm one", () => {
    installMarket(-10, 100_000, 100_000);
    settleMonthlyHeating();
    const coldWoodUse = getMarkets()[0].heatingLedger?.woodConsumption ?? 0;

    installMarket(20, 100_000, 100_000);
    settleMonthlyHeating();
    const warmWoodUse = getMarkets()[0].heatingLedger?.woodConsumption ?? 0;

    // A warm month still burns cooking fuel for all 100 lots of residents.
    expect(warmWoodUse).toBeCloseTo(100 * BASE_COOKING_UNITS_PER_1000_RESIDENTS_MONTH, 4);
    expect(coldWoodUse).toBeGreaterThan(warmWoodUse * 2);
  });

  it("burns rural households' own cut Wood before drawing on market stock", () => {
    installMarket(-10, 100_000, 100_000);
    settleMonthlyHeating();
    const marketOnlyDraw = 100_000 - getMarkets()[0].goods[1].stock;

    installMarket(-10, 100_000, 100_000);
    const market = getMarkets()[0];
    market.woodSupply = {
      monthKey: getWoodSupplyMonthKey(),
      ruralFuelDemand: 5,
      ruralFuelWood: 5,
      marketWood: 0,
      clearanceBurned: 0,
      stockAfterSupply: 100,
      smoothedDraw: 0
    };
    settleMonthlyHeating();

    expect(100_000 - market.goods[1].stock).toBeCloseTo(marketOnlyDraw - 5, 2);
    expect(market.heatingLedger?.selfSuppliedWood).toBe(5);
    expect(market.heatingLedger?.woodConsumption).toBeCloseTo(marketOnlyDraw, 4);
  });

  it("makes towns pay for their fuel and sends the money to the countryside", () => {
    installMarket(-10, 100_000, 0, 1_000);
    settleMonthlyHeating();
    const market = getMarkets()[0];
    const spent = 1_000 - getHouseholdWealth(1);

    expect(spent).toBeGreaterThan(0);
    expect(market.heatingLedger?.urbanFuelSpending).toBeCloseTo(spent, 2);
    // No money is lost: it reaches the rural purse, or the merchants where there is none yet.
    expect(getRuralHouseholdWealth(market) + (market.marketTreasury?.balance ?? 0)).toBeCloseTo(spent, 2);
    expect(worldContext.pack.burgs[1]!.coldExposure).toBe(0);
  });

  it("leaves a town that cannot pay cold, cooking before heating", () => {
    installMarket(-10, 100_000, 0, 1);
    settleMonthlyHeating();
    const burg = worldContext.pack.burgs[1]!;

    expect(burg.coldExposure).toBeGreaterThan(0.9);
    expect(getHouseholdWealth(1)).toBeLessThan(1);

    installMarket(20, 100_000, 0, 1);
    settleMonthlyHeating();
    // A warm month needs no heating, so even an unfed hearth leaves nobody cold.
    expect(worldContext.pack.burgs[1]!.coldExposure).toBe(0);
  });

  it("uses Coal only after Wood is unavailable and turns that use into health pressure", () => {
    installMarket(-10, 0, 100);
    settleMonthlyHeating();
    const ledger = getMarkets()[0].heatingLedger!;

    expect(ledger.woodConsumption).toBe(0);
    expect(ledger.coalConsumption).toBeGreaterThan(0);
    expect(ledger.coalSmokeExposure).toBeGreaterThan(0);

    const base = healthPressureFromSanitation({
      waterContamination: 0.2,
      sanitationBurden: 0.2,
      organicStreetLoad: 0.1,
      scavengingRisk: 0.1,
      upstreamPollutionImport: 0,
      drinkingWaterSecurity: 0.5
    });
    const smoky = healthPressureFromSanitation({
      waterContamination: 0.2,
      sanitationBurden: 0.2,
      organicStreetLoad: 0.1,
      scavengingRisk: 0.1,
      upstreamPollutionImport: 0,
      drinkingWaterSecurity: 0.5,
      coalSmokeExposure: ledger.coalSmokeExposure
    });
    expect(smoky).toBeGreaterThan(base);
  });

  it("turns sustained cold residence into forestry, heating, and insulation knowledge", () => {
    installMarket(-10, 100_000, 0);
    settleMonthlyHeating();
    const market = getMarkets()[0];
    market.heatingLedger = { ...market.heatingLedger!, coldExposureMonths: 36 };

    settleAnnualColdClimateKnowledge();

    expect(market.heatingLedger).toMatchObject({
      forestryKnowledge: expect.any(Number),
      heatingTechnology: expect.any(Number),
      insulationTechnology: expect.any(Number)
    });
    expect(market.heatingLedger!.forestryKnowledge).toBeGreaterThan(0);
    expect(market.heatingLedger!.heatingTechnology).toBeGreaterThan(0);
    expect(market.heatingLedger!.insulationTechnology).toBeGreaterThan(0);
    expect(getForestRegrowthMultiplier(0)).toBeGreaterThan(1);
  });
});

describe("applyHeatingCapacityBonus", () => {
  beforeEach(() => {
    simulationContext.currentYear = 1000;
    simulationContext.currentMonth = 1;
    simulationContext.currentDay = 1;
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  it("raises effectiveCapacity in proportion to accumulated heating/insulation knowledge", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#fff",
        goods: {},
        heatingLedger: {
          populationLots: 1,
          effectiveTemperature: -5,
          heatingDemand: 1,
          woodConsumption: 1,
          coalConsumption: 0,
          unmetHeating: 0,
          coalSmokeExposure: 0,
          coldExposureMonths: 36,
          forestryKnowledge: 0.4,
          heatingTechnology: 0.8,
          insulationTechnology: 0.6,
          cumulativeWoodConsumption: 0,
          cumulativeCoalConsumption: 0,
          cumulativeUnmetHeating: 0
        }
      }
    ]);
    const burgs = [{ i: 1, market: 1, demographics: { capacity: 100, effectiveCapacity: 100 } }];

    applyHeatingCapacityBonus(burgs);

    // climateKnowledge = (0.8 + 0.6) / 2 = 0.7
    expect(burgs[0].demographics.effectiveCapacity).toBeCloseTo(
      100 + 100 * 0.7 * MAX_HEATING_CLIMATE_CAPACITY_BONUS,
      3
    );
  });

  it("composes additively on top of an existing effectiveCapacity, never overwrites it", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#fff",
        goods: {},
        heatingLedger: {
          populationLots: 1,
          effectiveTemperature: -5,
          heatingDemand: 1,
          woodConsumption: 1,
          coalConsumption: 0,
          unmetHeating: 0,
          coalSmokeExposure: 0,
          coldExposureMonths: 36,
          forestryKnowledge: 0.4,
          heatingTechnology: 1,
          insulationTechnology: 1,
          cumulativeWoodConsumption: 0,
          cumulativeCoalConsumption: 0,
          cumulativeUnmetHeating: 0
        }
      }
    ]);
    // effectiveCapacity already raised above the natural capacity by another mechanism
    // (e.g. foodImportNetwork.ts's import bonus) — this must add on top, not reset to it.
    const burgs = [{ i: 1, market: 1, demographics: { capacity: 100, effectiveCapacity: 140 } }];

    applyHeatingCapacityBonus(burgs);

    expect(burgs[0].demographics.effectiveCapacity).toBeCloseTo(140 + 100 * 1 * MAX_HEATING_CLIMATE_CAPACITY_BONUS, 3);
  });

  it("leaves a temperate market's effectiveCapacity untouched (no accumulated climate knowledge)", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#fff",
        goods: {},
        heatingLedger: {
          populationLots: 1,
          effectiveTemperature: 22,
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
        }
      }
    ]);
    const burgs = [{ i: 1, market: 1, demographics: { capacity: 100, effectiveCapacity: 100 } }];

    applyHeatingCapacityBonus(burgs);

    expect(burgs[0].demographics.effectiveCapacity).toBe(100);
  });

  it("skips a burg whose market has never settled a heatingLedger", () => {
    setMarkets([{ i: 1, centerBurgId: 1, color: "#fff", goods: {} }]);
    const burgs = [{ i: 1, market: 1, demographics: { capacity: 100, effectiveCapacity: 100 } }];

    applyHeatingCapacityBonus(burgs);

    expect(burgs[0].demographics.effectiveCapacity).toBe(100);
  });
});
