import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import { getHouseholdWealth } from "./burgMarketLedgers";
import { applyCharacterLivingCosts } from "./characterLivingCosts";
import { buyCharacterLuxuries } from "./characterLuxuryPurchases";
import { Goods } from "./goods-generator";
import type { Good } from "./goodsGeneratorTypes";
import { LUXURY_VALUE_DEMAND_SETTING } from "./luxuryDemand";
import { Markets } from "./markets-generator";
import type { Market } from "./marketTypes";

const FURS = 1;
const SILK = 2;
const JEWELRY = 3;
const SCULPTURES = 4;

const good = (i: number, name: string, value: number, luxury?: number) =>
  ({
    i,
    name,
    tags: ["luxury"],
    value,
    unit: "lot",
    icon: name,
    color: "#000",
    ...(luxury ? { demandCoverage: { luxury } } : {})
  }) as unknown as Good;

describe("character luxury purchases", () => {
  let market: Market;
  let ruler: Character;

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    const burg = { i: 1, cell: 0, x: 0, y: 0, market: 1, population: 10, capital: 1, treasury: 0 } as unknown as Burg;
    ruler = {
      i: 1,
      name: "Queen",
      wealth: 1000,
      location: 1,
      state: 1,
      titles: [{ title: "Queen", landed: true, entityType: "state", entityId: 1 }],
      backstory: { tastes: [{ id: "luxury", polarity: "like", intensity: 80 }] }
    } as unknown as Character;
    worldContext.pack = { burgs: [undefined, burg], states: [], characters: [ruler] } as unknown as PackedGraph;
    setGoods([
      good(FURS, "Furs", 6, 0.5),
      good(SILK, "Silk", 16, 1),
      good(JEWELRY, "Jewelry", 55),
      good(SCULPTURES, "Sculptures", 42, 1)
    ]);
    market = {
      i: 1,
      centerBurgId: 1,
      color: "#111",
      goods: {
        [FURS]: { stock: 100, price: 1.5 },
        [SILK]: { stock: 100, price: 16 },
        [JEWELRY]: { stock: 100, price: 55 },
        [SCULPTURES]: { stock: 1000, price: 42 }
      },
      marketTreasury: { balance: 0, ruralGrainPayable: 0 }
    } as unknown as Market;
    setMarkets([market]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => {
    clearCharactersContext();
    clearEconomyContext();
    delete simulationContext.worldSettings;
  });

  it("buys luxuries the character likes at the home market, moving the money without loss", () => {
    simulationContext.worldSettings = { [LUXURY_VALUE_DEMAND_SETTING]: "on" };
    const households = getHouseholdWealth(1);
    applyCharacterLivingCosts();
    const paid = 1000 - (ruler.wealth ?? 0);
    expect(paid).toBeGreaterThan(0);
    // Jewelry is liked (taste "luxury"); Sculptures hold more stock value but only take the
    // rounding remainder of the precious budget.
    const bought = (id: number, before: number) => (before - market.goods[id].stock) * market.goods[id].price;
    expect(bought(JEWELRY, 100)).toBeGreaterThan(bought(SCULPTURES, 1000) * 5);
    expect(market.marketTreasury!.balance).toBeGreaterThan(0);
    expect(market.marketTreasury!.balance + getHouseholdWealth(1) - households).toBeCloseTo(paid, 1);
  });

  it("buys default fine wool apparel from the character budget while leaving ordinary garments in stock", () => {
    const fine = Goods.getDefaultGood("Fine Wool Garments")!;
    const ordinary = Goods.getDefaultGood("Garments")!;
    setGoods([fine, ordinary]);
    Goods.sync();
    market.goods = { [fine.i]: { stock: 10, price: fine.value }, [ordinary.i]: { stock: 10, price: ordinary.value } };
    expect(buyCharacterLuxuries(ruler, "guildMaster", 3)).toBeGreaterThan(0);
    expect(market.goods[fine.i].stock).toBeLessThan(10);
    expect(market.goods[ordinary.i].stock).toBe(10);
  });

  it("spends only cash in the town when the value demand is off", () => {
    const households = getHouseholdWealth(1);
    applyCharacterLivingCosts();
    expect(market.marketTreasury!.balance).toBe(0);
    expect(getHouseholdWealth(1) - households).toBeCloseTo(1000 - (ruler.wealth ?? 0), 2);
  });
});
