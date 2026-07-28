import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

  afterEach(() => clearEconomyContext());

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
});
