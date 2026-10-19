import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  getMintLedgers,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { Markets } from "./markets-generator";
import { Minting } from "./minting";

describe("MintingModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [0, { i: 1, state: 1, market: 1, population: 20 }],
      states: [{ i: 0 } as State, { i: 1, rural: 100, urban: 20, treasury: 0 } as State]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Gold Ingot", tags: ["ingot"], value: 40, unit: "bullion", icon: "gold", color: "#fc0" },
      { i: 2, name: "Silver Ingot", tags: ["ingot"], value: 20, unit: "bullion", icon: "silver", color: "#ccc" },
      { i: 3, name: "Copper Ingot", tags: ["ingot"], value: 5, unit: "wagon", icon: "copper", color: "#b73" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 5, price: 40 },
          2: { stock: 20, price: 20 },
          3: { stock: 50, price: 5 }
        }
      }
    ]);
    Markets.sync();
  });

  afterEach(() => {
    clearEconomyContext();
    delete simulationContext.worldSettings;
  });

  it("keeps an initial circulation reserve, then converts finite market metal into currency", () => {
    Minting.generate();
    const ledger = getMintLedgers()[0];
    const initialCirculation = ledger.circulation;

    expect(initialCirculation).toBeGreaterThan(0);
    ledger.circulation = 0;
    Minting.settleMonthly();

    expect(ledger.lastMintedValue).toBeGreaterThan(0);
    expect(ledger.circulation).toBeGreaterThan(0);
    expect(getMarkets()[0].goods[2].stock).toBeLessThan(20);
    expect(worldContext.pack.states[1].treasury).toBeGreaterThan(0);
  });

  it("cannot mint indefinitely after all monetary metal stock is consumed", () => {
    Minting.generate();
    const ledger = getMintLedgers()[0];
    ledger.circulation = 0;
    getMarkets()[0].goods[1].stock = 0;
    getMarkets()[0].goods[2].stock = 0;
    getMarkets()[0].goods[3].stock = 0;

    Minting.settleMonthly();

    expect(ledger.lastMintedValue).toBe(0);
    expect(worldContext.pack.states[1].treasury).toBe(0);
  });

  describe("money-supply model (docs/plan/money-supply-mint.md §4.1)", () => {
    beforeEach(() => {
      simulationContext.worldSettings = { "fmg-money-supply": "on" };
    });

    it("buys bullion at its coin value with new coin and lowers prices while coin is short", () => {
      const market = getMarkets()[0];
      market.goods[1].price = 30;
      // Silver selling above its coin value goes to craftsmen, not the mint (§11.3).
      market.goods[2].price = 25;
      Minting.generate();
      const ledger = getMintLedgers()[0];
      expect(ledger.circulation).toBe(0);
      expect(ledger.priceLevel).toBe(1);

      Minting.settleMonthly();

      // 20% of each stock at coin value: 1 gold at 40, 10 copper at 5; no silver.
      expect(ledger.lastMintedValue).toBe(90);
      expect(market.goods[2].stock).toBe(20);
      expect(ledger.lastSeigniorage).toBe(1.8);
      expect(worldContext.pack.states[1].treasury).toBe(1.8);
      expect(market.marketTreasury?.balance).toBe(88.2);
      expect(ledger.circulation).toBe(90);
      expect(ledger.priceLevel).toBeLessThan(1);
    });

    it("coins bullion brought to any market of the State and pays that market", () => {
      worldContext.pack.burgs = [
        0,
        { i: 1, state: 1, market: 1, population: 20 },
        { i: 2, state: 1, market: 2, population: 2 }
      ] as never;
      for (const good of Object.values(getMarkets()[0].goods)) good.stock = 0;
      setMarkets([...getMarkets(), { i: 2, centerBurgId: 2, color: "#222", goods: { 2: { stock: 50, price: 20 } } }]);
      Markets.sync();
      Minting.generate();

      Minting.settleMonthly();

      // 20% of the outlying market's 50 silver at its coin value of 20.
      expect(getMintLedgers()[0].lastMintedValue).toBe(200);
      expect(getMarkets()[1].marketTreasury?.balance).toBe(196);
    });

    it("issues nothing without bullion", () => {
      for (const good of Object.values(getMarkets()[0].goods)) good.stock = 0;
      Minting.generate();
      Minting.settleMonthly();
      expect(getMintLedgers()[0].lastMintedValue).toBe(0);
      expect(getMarkets()[0].marketTreasury?.balance ?? 0).toBe(0);
    });
  });
});
