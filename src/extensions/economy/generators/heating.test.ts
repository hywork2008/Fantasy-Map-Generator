import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  initEconomyContext,
  setGoods,
  setMarketCellColumn,
  setMarkets
} from "../economyContext";
import { getForestRegrowthMultiplier, settleAnnualColdClimateKnowledge, settleMonthlyHeating } from "./heating";
import { healthPressureFromSanitation } from "./urbanWaterInstitutions";

function installMarket(temperature: number, woodStock: number, coalStock: number): void {
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

  it("draws substantially more Wood in a cold market than in a warm one", () => {
    installMarket(-10, 100, 100);
    settleMonthlyHeating();
    const coldWoodUse = getMarkets()[0].heatingLedger?.woodConsumption ?? 0;

    installMarket(20, 100, 100);
    settleMonthlyHeating();
    const warmWoodUse = getMarkets()[0].heatingLedger?.woodConsumption ?? 0;

    expect(coldWoodUse).toBeGreaterThan(0);
    expect(warmWoodUse).toBe(0);
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
    installMarket(-10, 100, 0);
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
