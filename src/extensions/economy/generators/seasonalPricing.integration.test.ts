import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifyAgriculturalClimateZone,
  classifySeasonRegion,
  getCropCalendar,
  SEASON_REGION_PROFILES
} from "../../../data/cropCalendars";
import { STAPLE_CROP_PROFILES } from "../../../data/stapleCrops";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, getGoods, getMarkets, initEconomyContext, setMarkets } from "../economyContext";
import { Goods } from "./goods-generator";
import { MarketsModule } from "./markets-generator";
import type { Market } from "./marketTypes";

/**
 * End-to-end validation of the design's core claim (docs/simulation/seasons.md §4, see the
 * plan's Phase 2 risk note): that a per-crop monthly harvest calendar, combined with the
 * EXISTING demand/stock price formula in initializeMarketPrices(), is sufficient on its own to
 * make a staple crop cheap right after its harvest month and expensive in the lean month right
 * before it -- with no separate seasonal price-modifier code required.
 *
 * 2026-08-13: rewritten for the crop-calendar model (production-utils.ts's getCalendarForGood)
 * that replaced the old flat "food"-tag autumn curve. Seasonality now only applies to goods with
 * a `crop`/`perennialCrop` calendar profile (docs/simulation/seasons.md §4), so the fixture below
 * models a staple cereal (Wheat's real STAPLE_CROP_PROFILES entry) instead of a generic
 * "food"-tagged good -- a plain "food" tag with no calendar is intentionally flat year-round now.
 */
describe("seasonal staple-crop price cycle (integration)", () => {
  let marketsModule: MarketsModule;

  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    marketsModule = new MarketsModule();

    worldContext.mapCoordinates = { latN: 90, latT: 180 };
    worldContext.graphHeight = 100;
    // Goods.getBiomesProduction() enumerates biome codes from biomesData (it resolves
    // biomeOutputByTag as well as biomeOutput), so the cell's biome 6 must exist there or
    // no rural production is attributed at all.
    worldContext.biomesData = {
      i: [0, 1, 2, 3, 4, 5, 6],
      name: ["Marine", "Hot desert", "Cold desert", "Savanna", "Grassland", "Tropical forest", "Temperate forest"],
      tags: [[], [], [], [], [], ["forest"], ["forest"]]
    } as unknown as typeof worldContext.biomesData;
    // getCalendarForGood (production-utils.ts) classifies the cell's agricultural climate zone
    // from grid.cells.temp/prec -- 10C / 45 (x100mm scale) lands it in "temperate-rainfed-single".
    worldContext.grid = {
      cells: {
        temp: new Int8Array([10]),
        prec: [45]
      }
    } as unknown as typeof worldContext.grid;
    worldContext.pack = {
      goods: [
        {
          i: 0,
          name: "Wheat",
          value: 1,
          tags: ["food", "crop", "stapleCrop", "cereal"],
          unit: "wain",
          icon: "icon",
          color: "#fff",
          distribution: "1",
          recipes: [],
          demandCoverage: { food: 1 },
          biomeOutput: { 6: 0.5 },
          crop: STAPLE_CROP_PROFILES.Wheat
        }
      ],
      cultures: [],
      burgs: [
        { i: 0 } as unknown as PackedGraph["burgs"][number],
        { i: 1, market: 1, population: 100 } as unknown as PackedGraph["burgs"][number]
      ],
      zones: [],
      markets: [],
      cells: {
        i: [0],
        g: Uint16Array.from([0]), // packed cell 0 -> grid cell 0, matching the single-cell grid above
        biomeCode: new Uint8Array([6]),
        culture: new Uint16Array([0]),
        state: new Uint16Array([0]),
        religion: new Uint16Array([0]),
        burg: new Uint16Array([0]),
        good: new Uint16Array([0]),
        market: Uint16Array.from([1]),
        pop: [50],
        h: new Uint8Array([50]),
        c: [[]],
        p: [[0, 40]] // y=40 of 100 -> latitude 18 (northern hemisphere)
      }
    } as unknown as PackedGraph;
    Goods.sync();

    // Pre-seed the good's market entry: unlike the old flat "food" curve, the crop calendar
    // produces nothing in most months (see harvestWeights below), so addRuralOutput()'s lazy
    // stock/price creation wouldn't run until the first harvest month if left to `{}`.
    const market1: Market = { i: 1, centerBurgId: 1, color: "#ff0000", goods: { 0: { stock: 0, price: 1 } } };
    setMarkets([market1]);
    // biome-ignore lint/complexity/useLiteralKeys: private access for testing
    marketsModule["marketById"] = [undefined as unknown as Market, market1];
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("cycles staple-crop stock/price seasonally: cheapest right after harvest, priciest right before it", () => {
    const goodId = getGoods()[0].i;
    const monthlyDemandUnits = 100 * 0.2; // burg population(100) * DEMAND_TARGET_FACTORS.food(0.2)
    const priceByMonth: number[] = [];

    for (let month = 1; month <= 24; month++) {
      worldContext.options = { month: ((month - 1) % 12) + 1 } as unknown as PackedGraph["options"];
      marketsModule.collectRuralProduction();

      // Stand in for Production.produce()'s fillBurgsDemand() step (not exercised directly
      // here): burgs draw stock down toward their demand target every tick, so stock doesn't
      // just accumulate forever and the seasonal production curve actually shows up as a
      // stock/price cycle rather than a one-directional drift.
      const marketGood = getMarkets()[0].goods[goodId];
      marketGood.stock = Math.max(0, marketGood.stock - monthlyDemandUnits);

      marketsModule.initializeMarketPrices();
      priceByMonth.push(getMarkets()[0].goods[goodId].price);
    }

    // Settle into the second simulated year (index 12-23) so the stock/price series has
    // stabilized past the arbitrary starting-stock transient of year one. year2[k] is the price
    // for calendar month k+1 (Jan=0 .. Dec=11), matching cropCalendars.ts's MonthlyWeights index.
    const year2 = priceByMonth.slice(12, 24);

    // Derive the expected harvest month directly from the same crop-calendar module the
    // production code (getCalendarForGood, production-utils.ts) calls, instead of hardcoding a
    // month here that could silently drift out of sync with cropCalendars.ts/stapleCrops.ts.
    const region = classifySeasonRegion(18); // matches the cell's latitude computed above
    const zone = classifyAgriculturalClimateZone({ annualTemperatureC: 10, annualPrecipitation: 45, irrigated: false });
    const calendar = getCropCalendar(SEASON_REGION_PROFILES[region], zone, STAPLE_CROP_PROFILES.Wheat.calendar);
    const harvestMonthIndex = calendar.harvestWeights.indexOf(Math.max(...calendar.harvestWeights));
    const leanMonthIndex = (harvestMonthIndex + 11) % 12; // the month right before harvest reopens

    const harvestPrice = year2[harvestMonthIndex];
    const leanPrice = year2[leanMonthIndex];

    expect(harvestPrice).toBeLessThan(leanPrice);
  });
});
