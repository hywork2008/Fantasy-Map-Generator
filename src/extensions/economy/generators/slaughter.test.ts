import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import { creditHouseholdWealth, debitHouseholdWealth, getHouseholdWealth } from "./burgMarketLedgers";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { FARMGATE_PRICE_SHARE } from "./foodProduction";
import { WAIN_KG } from "./goodMeasureCatalog";
import type { Good } from "./goods-generator";
import { HERD_MEAT_OFFTAKE } from "./herdDiet";
import { getRuralHouseholdWealth } from "./householdWealth";
import type { Market } from "./marketTypes";
import {
  MEAT_HOUSEHOLD_CASH_SHARE,
  settleSlaughter,
  singleIngredientHeads,
  URBAN_MEAT_KG_PER_PERSON_YEAR
} from "./slaughter";

function market(goods: Market["goods"]): Market {
  return { i: 1, centerBurgId: 1, color: "#000", goods };
}

const simulation = { currentYear: 1350 };

describe("settleSlaughter", () => {
  beforeEach(() => {
    simulation.currentYear = 1350;
    initEconomyContext({ worldContext, simulationContext: simulation } as unknown as ExtensionAPI);
  });

  afterEach(() => clearEconomyContext());

  it("turns the catalog tallow and leather ratios into a joint yield and leaves the rest of the herd", () => {
    const goods = [
      { i: 1, name: "Pig", tags: ["food", "liveAnimal"], value: 2 },
      { i: 2, name: "Cattle", tags: ["food", "draft", "liveAnimal"], value: 5 },
      { i: 3, name: "Sheep", tags: ["food", "clothing", "liveAnimal"], value: 4 },
      { i: 4, name: "Chicken", tags: ["food", "liveAnimal"], value: 1 },
      { i: 5, name: "Horses", tags: ["supply", "military", "draft", "liveAnimal"], value: 8 },
      { i: 6, name: "Tallow", tags: ["fuel"], value: 2, recipes: [{ 2: 0.3 }, { 3: 0.5 }, { 1: 0.5 }] },
      { i: 7, name: "Leather", tags: ["clothing"], value: 6, recipes: [{ 2: 1 }, { 5: 0.5 }] }
    ] as Good[];
    setGoods(goods);
    const stall = market({
      1: { stock: 2, price: 2 },
      2: { stock: 1, price: 5 },
      3: { stock: 1, price: 4 },
      4: { stock: 6, price: 1 },
      5: { stock: 3, price: 8 }
    });
    setMarkets([stall]);

    expect(singleIngredientHeads(goods[5], 1)).toBe(0.5);
    const result = settleSlaughter();
    expect(result).toEqual({ heads: 4, tallow: 9.33, leather: 1, rennet: 0, meat: 0, meatSold: 0 });
    expect(stall.goods[1].stock).toBe(0);
    expect(stall.goods[2].stock).toBe(0);
    expect(stall.goods[3].stock).toBe(0);
    expect(stall.goods[4].stock).toBe(6);
    expect(stall.goods[5].stock).toBe(3);
    expect(stall.goods[6].stock).toBe(9.33);
    expect(stall.goods[7].stock).toBe(1);
  });
  it("recovers rennet only from explicitly eligible calves, without consuming extra cattle or rounding it away", () => {
    const cattle = { i: 1, name: "Cattle", tags: ["food", "liveAnimal"], value: 5 } as Good;
    const leather = { i: 2, name: "Leather", tags: ["clothing"], value: 6 } as Good;
    const rennet = { i: 3, name: "Rennet", tags: ["preservative"], value: 40 } as Good;
    setGoods([cattle, leather, rennet]);
    const stall = market({ 1: { stock: 2, price: 5 } });
    setMarkets([stall]);
    const result = settleSlaughter(new Map([[stall.i, 1]]));
    expect(result).toEqual({ heads: 2, leather: 2, tallow: 0, rennet: 1 / 240, meat: 0, meatSold: 0 });
    expect(stall.goods[1].stock).toBe(0);
    expect(stall.goods[3].stock).toBe(1 / 240);
    expect(settleSlaughter(new Map([[stall.i, 1]])).rennet).toBe(0);
    expect(stall.goods[3].stock).toBe(1 / 240);

    stall.goods[1].stock = 1;
    expect(settleSlaughter().rennet).toBe(0);
    expect(stall.goods[3].stock).toBe(1 / 240);
    stall.goods[1].stock = 1;
    expect(settleSlaughter(new Map([[stall.i, 240]])).rennet).toBe(1 / 240);
    expect(stall.goods[3].stock).toBe(2 / 240);
  });

  describe("fresh Meat (docs/plan/livestock-meat-sales.md)", () => {
    const people = 1000;
    function setUp(purse: number): Market {
      setGoods([
        { i: 1, name: "Cattle", tags: ["food", "liveAnimal"], value: 5 },
        { i: 2, name: "Tallow", tags: ["fuel"], value: 2, recipes: [{ 1: 0.3 }] },
        { i: 3, name: "Meat", tags: ["food", "freshFood"], value: 2.5 },
        { i: 4, name: "Grain", tags: ["food", "stapleFood"], value: 1 }
      ] as Good[]);
      worldContext.populationRate = 1;
      worldContext.urbanization = 1;
      worldContext.pack = {
        burgs: [{ i: 0 } as Burg, { i: 1, market: 1, population: people } as unknown as Burg],
        cells: { i: [], h: [], pop: [] }
      } as unknown as PackedGraph;
      const stall = market({ 1: { stock: 10, price: 5 }, 4: { stock: 0, price: 1 } });
      stall.foodLedger = { ruralHouseholdWealth: 0 } as Market["foodLedger"];
      setMarkets([stall]);
      debitHouseholdWealth(1, getHouseholdWealth(1));
      creditHouseholdWealth(1, purse);
      return stall;
    }
    const meatWains = (10 * HERD_MEAT_OFFTAKE.Cattle.edibleKg) / WAIN_KG;

    it("sells the carcasses to a town that can pay and pays the farm families their share", () => {
      const stall = setUp(1000);
      const result = settleSlaughter();
      expect(result.meat).toBeCloseTo(meatWains, 6);
      // The town wants more than ten cattle give, so it takes all of it.
      expect((people * URBAN_MEAT_KG_PER_PERSON_YEAR) / 12 / WAIN_KG).toBeGreaterThan(meatWains);
      expect(result.meatSold).toBeCloseTo(meatWains, 2);
      const bill = meatWains * 2.5;
      expect(getHouseholdWealth(1)).toBeCloseTo(1000 - bill, 1);
      expect(getRuralHouseholdWealth(stall)).toBeCloseTo(bill * FARMGATE_PRICE_SHARE, 1);
      expect(stall.marketTreasury?.balance).toBeCloseTo(bill * (1 - FARMGATE_PRICE_SHARE), 1);
      expect(stall.goods[3].stock).toBe(0);
    });

    it("lets a poor town buy only from what is left after its staple bill, and the rest is eaten at home", () => {
      const stall = setUp(50);
      const budget = (50 - (people * GROSS_FOOD_NEED) / 12) * MEAT_HOUSEHOLD_CASH_SHARE;
      const result = settleSlaughter();
      expect(result.meatSold).toBeCloseTo(budget / 2.5, 2);
      expect(result.meatSold).toBeLessThan(result.meat);
      expect(getRuralHouseholdWealth(stall)).toBeCloseTo(budget * FARMGATE_PRICE_SHARE, 1);
      // Nothing waits in stock for craft or trade, and the unsold meat earns nothing.
      expect(stall.goods[3].stock).toBe(0);
      expect(getHouseholdWealth(1)).toBeCloseTo(50 - budget, 1);
    });

    it("keeps the year's meat produced and sold, and closes the sold share when the year turns", () => {
      const stall = setUp(1000);
      settleSlaughter();
      const kg = 10 * HERD_MEAT_OFFTAKE.Cattle.edibleKg;
      expect(stall.meatSales).toMatchObject({ year: 1350, lastSoldShare: undefined });
      expect(stall.meatSales?.producedKg).toBeCloseTo(kg, 1);
      expect(stall.meatSales?.soldKg).toBeCloseTo(kg, 0);
      simulation.currentYear = 1351;
      stall.goods[1].stock = 10;
      settleSlaughter();
      expect(stall.meatSales?.year).toBe(1351);
      expect(stall.meatSales?.lastSoldShare).toBeCloseTo(1, 3);
    });
  });
});
