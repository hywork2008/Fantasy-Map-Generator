import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMarkets } from "../economyContext";
import { computeCreditRating, refreshCreditRatingAndBondPrices, runBondSecondaryMarket } from "./bondMarket";

describe("bondMarket (PR-15)", () => {
  afterEach(() => clearEconomyContext());
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    setMarkets([]);
  });

  it("rates a healthy polity better than a double-defaulted one", () => {
    const healthy = {
      i: 1,
      treasury: 50,
      councilSupport: 70,
      publicDebt: 10,
      foreignLoans: []
    } as unknown as State;
    const junk = {
      i: 2,
      treasury: 1,
      councilSupport: 20,
      publicDebt: 180,
      debtInDefault: true,
      foreignDebtInDefault: true,
      civilUnrest: true,
      foreignLoans: [{ creditorStateId: 1, principal: 50, interestRate: 0.03, inDefault: true }]
    } as unknown as State;

    expect(computeCreditRating(healthy).score).toBeGreaterThan(computeCreditRating(junk).score);
    expect(computeCreditRating(junk).rating).toBe("D");
  });

  it("reprices bond-market loans to the rating rate", () => {
    const state = {
      i: 1,
      treasury: 40,
      councilSupport: 60,
      publicDebt: 0,
      foreignLoans: [
        {
          creditorStateId: 2,
          creditorName: "Bond mkt via X",
          principal: 20,
          interestRate: 0.02,
          viaBondMarket: true
        }
      ]
    } as unknown as State;
    worldContext.pack = { states: [undefined, state], burgs: [], characters: [] } as unknown as PackedGraph;

    const rating = refreshCreditRatingAndBondPrices(state);
    expect(state.creditRating).toBe(rating.rating);
    expect(state.bondMarketRate).toBeGreaterThan(0);
    expect(state.foreignLoans?.[0]?.interestRate).toBe(state.bondMarketRate);
  });

  it("transfers a bond tranche on the secondary market", () => {
    const borrower = {
      i: 1,
      form: "Monarchy",
      treasury: 5,
      diplomacy: ["x", "x", "Neutral", "Neutral"],
      foreignLoans: [
        {
          creditorStateId: 2,
          creditorName: "Bond mkt via Poor",
          principal: 40,
          interestRate: 0.03,
          viaBondMarket: true
        }
      ]
    } as unknown as State;
    const seller = { i: 2, name: "Poor", treasury: 20, diplomacy: [] } as unknown as State;
    const buyer = { i: 3, name: "Rich", treasury: 100, diplomacy: [] } as unknown as State;
    worldContext.pack = {
      states: [undefined, borrower, seller, buyer],
      burgs: [],
      characters: []
    } as unknown as PackedGraph;

    const result = runBondSecondaryMarket(borrower);
    expect(result.transferred).toBeGreaterThan(0);
    expect(result.toCreditorId).toBe(3);
    expect(buyer.treasury).toBeLessThan(100);
    expect(seller.treasury).toBeGreaterThan(20);
  });
});
