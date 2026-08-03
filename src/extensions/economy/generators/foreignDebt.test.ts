import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMarkets } from "../economyContext";
import {
  FOREIGN_DEBT_ISSUE_AMOUNT,
  findBondMarketUnderwriter,
  findForeignCreditor,
  issueBondMarketDebt,
  issueForeignDebt,
  serviceForeignDebt,
  sumForeignDebtPrincipal
} from "./foreignDebt";

describe("foreignDebt (PR-13)", () => {
  afterEach(() => {
    clearEconomyContext();
  });

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    setMarkets([]);
  });

  it("finds an Ally creditor with surplus treasury", () => {
    const borrower = {
      i: 1,
      form: "Monarchy",
      treasury: 0,
      diplomacy: ["x", "x", "Ally"]
    } as unknown as State;
    const creditor = {
      i: 2,
      name: "Richland",
      form: "Republic",
      treasury: 100,
      diplomacy: ["x", "Friendly", "x"]
    } as unknown as State;
    worldContext.pack = {
      states: [undefined, borrower, creditor],
      burgs: [],
      characters: []
    } as unknown as PackedGraph;

    const found = findForeignCreditor(borrower);
    expect(found?.i).toBe(2);
  });

  it("issues foreign debt from creditor L2 into borrower L2", () => {
    const borrower = {
      i: 1,
      form: "Monarchy",
      treasury: 0,
      diplomacy: ["x", "x", "Ally"]
    } as unknown as State;
    const creditor = {
      i: 2,
      name: "Richland",
      form: "Republic",
      treasury: 100,
      diplomacy: ["x", "Friendly", "x"]
    } as unknown as State;
    worldContext.pack = {
      states: [undefined, borrower, creditor],
      burgs: [],
      characters: []
    } as unknown as PackedGraph;

    const result = issueForeignDebt(borrower);
    expect(result.ok).toBe(true);
    expect(result.amount).toBeGreaterThan(0);
    expect(borrower.treasury).toBe(result.amount);
    expect(creditor.treasury).toBeLessThan(100);
    expect(sumForeignDebtPrincipal(borrower)).toBe(result.amount);
    expect(borrower.foreignLoans?.[0]?.creditorStateId).toBe(2);
  });

  it("services interest to the creditor", () => {
    // Keep L2 ≤ 20 so auto principal repay does not fire (only interest path).
    const borrower = {
      i: 1,
      form: "Monarchy",
      treasury: 15,
      foreignLoans: [
        {
          creditorStateId: 2,
          creditorName: "Richland",
          principal: 40,
          interestRate: 0.05
        }
      ]
    } as unknown as State;
    const creditor = {
      i: 2,
      name: "Richland",
      treasury: 10,
      diplomacy: []
    } as unknown as State;
    worldContext.pack = {
      states: [undefined, borrower, creditor],
      burgs: [],
      characters: []
    } as unknown as PackedGraph;

    const result = serviceForeignDebt(borrower);
    expect(result.interestPaid).toBeCloseTo(2, 5);
    expect(result.principalRepaid).toBe(0);
    expect(creditor.treasury).toBeCloseTo(12, 5);
    expect(borrower.treasury).toBeCloseTo(13, 5);
  });

  it("refuses Anarchy foreign debt", () => {
    const state = { i: 1, form: "Anarchy", treasury: 0, diplomacy: ["x", "x", "Ally"] } as unknown as State;
    const creditor = { i: 2, treasury: 100, diplomacy: [] } as unknown as State;
    worldContext.pack = {
      states: [undefined, state, creditor],
      burgs: [],
      characters: []
    } as unknown as PackedGraph;
    expect(issueForeignDebt(state, FOREIGN_DEBT_ISSUE_AMOUNT).ok).toBe(false);
  });

  it("issues bond-market debt via a Neutral underwriter (PR-14)", () => {
    const borrower = {
      i: 1,
      form: "Monarchy",
      treasury: 0,
      diplomacy: ["x", "x", "Neutral"]
    } as unknown as State;
    const underwriter = {
      i: 2,
      name: "Bankport",
      form: "Republic",
      treasury: 120,
      diplomacy: ["x", "Neutral", "x"]
    } as unknown as State;
    worldContext.pack = {
      states: [undefined, borrower, underwriter],
      burgs: [],
      characters: []
    } as unknown as PackedGraph;

    expect(findForeignCreditor(borrower)).toBeNull();
    expect(findBondMarketUnderwriter(borrower)?.i).toBe(2);

    const result = issueBondMarketDebt(borrower);
    expect(result.ok).toBe(true);
    expect(result.viaBondMarket).toBe(true);
    expect(borrower.foreignLoans?.[0]?.viaBondMarket).toBe(true);
    expect(borrower.treasury).toBe(result.amount);
    expect(underwriter.treasury).toBeLessThan(120);
  });
});
