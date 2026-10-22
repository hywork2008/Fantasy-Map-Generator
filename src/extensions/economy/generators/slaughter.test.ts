import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import type { Good } from "./goods-generator";
import type { Market } from "./marketTypes";
import { settleSlaughter, singleIngredientHeads } from "./slaughter";

function market(goods: Market["goods"]): Market {
  return { i: 1, centerBurgId: 1, color: "#000", goods };
}

describe("settleSlaughter", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext, simulationContext: { currentYear: 1350 } } as unknown as ExtensionAPI);
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
    expect(result).toEqual({ heads: 4, tallow: 9.33, leather: 1, rennet: 0 });
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
    expect(result).toEqual({ heads: 2, leather: 2, tallow: 0, rennet: 1 / 240 });
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
});
