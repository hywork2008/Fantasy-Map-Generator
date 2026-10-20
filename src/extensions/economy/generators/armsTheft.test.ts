import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, getMarkets, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import {
  getArmsStolenInState,
  getLootableAgeWeight,
  getTheftUnrest,
  settleArmsTheft,
  WEAPON_AGE_MAX_MONTHS
} from "./armsTheft";

describe("armsTheft", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, discontent: 90, security: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Arms", tags: ["military"], value: 24, unit: "set", icon: "arms", color: "#333" },
      { i: 2, name: "Tools", tags: ["utilities"], value: 14, unit: "set", icon: "tools", color: "#777" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { 1: { stock: 10, price: 24 }, 2: { stock: 10, price: 14 } }
      }
    ]);
  });

  afterEach(() => clearEconomyContext());

  const months = (count: number) => {
    for (let month = 0; month < count; month++) settleArmsTheft();
  };

  it("takes the worse of discontent and public order, and none from a calm, orderly town", () => {
    expect(getTheftUnrest({ discontent: 40, security: 50 })).toBe(0);
    expect(getTheftUnrest({ discontent: 70, security: 80 })).toBeCloseTo(0.5, 5);
    expect(getTheftUnrest({ discontent: 0, security: 10 })).toBeCloseTo(0.8, 5);
    expect(getTheftUnrest({})).toBe(0);
  });

  it("leaves a young stock alone and makes a year-old one fully lootable", () => {
    expect(getLootableAgeWeight(5)).toBe(0);
    expect(getLootableAgeWeight(WEAPON_AGE_MAX_MONTHS)).toBe(1);
  });

  it("steals only from weapons that stayed unsold long enough, and counts them on the burg", () => {
    months(5);
    expect(getMarkets()[0].goods[1].stock).toBe(10);
    expect(worldContext.pack.burgs[1].armsStolen).toBeUndefined();

    months(10);
    const stolen = worldContext.pack.burgs[1].armsStolen ?? 0;
    expect(stolen).toBeGreaterThan(0);
    expect(getMarkets()[0].goods[1].stock).toBeCloseTo(10 - stolen, 3);
    expect(worldContext.pack.burgs[1].armsStolenByGood).toEqual({ Arms: stolen });
    expect(getArmsStolenInState(1)).toBeCloseTo(stolen, 4);
    // Tools are not weapons.
    expect(getMarkets()[0].goods[2].stock).toBe(10);
  });

  it("steals nothing from a calm town, however long the stock sits", () => {
    worldContext.pack.burgs[1].discontent = 10;
    months(24);
    expect(getMarkets()[0].goods[1].stock).toBe(10);
    expect(worldContext.pack.burgs[1].armsStolen).toBeUndefined();
  });

  it("treats stock sold off as taken from the oldest, so a fresh batch is not stolen as old", () => {
    months(14);
    getMarkets()[0].goods[1].stock = 0; // the armory drew everything
    settleArmsTheft();
    const after = worldContext.pack.burgs[1].armsStolen ?? 0;
    getMarkets()[0].goods[1].stock = 5; // a new batch arrives
    months(3);
    expect(worldContext.pack.burgs[1].armsStolen ?? 0).toBeCloseTo(after, 3);
  });
});
