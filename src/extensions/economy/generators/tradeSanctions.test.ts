import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMarkets } from "../economyContext";
import {
  applyTradeSanctionToIncome,
  getTradeSanctionMultiplier,
  refreshTradeSanctions,
  TRADE_SANCTION_BASE_MULT
} from "./tradeSanctions";

describe("tradeSanctions (PR-15)", () => {
  afterEach(() => clearEconomyContext());
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    setMarkets([]);
  });

  it("returns 1.0 when not in foreign default", () => {
    const state = { i: 1, foreignDebtInDefault: false, foreignLoans: [] } as unknown as State;
    expect(getTradeSanctionMultiplier(state)).toBe(1);
  });

  it("haircuts income and skims to creditors when sanctioned", () => {
    const state = {
      i: 1,
      foreignDebtInDefault: true,
      foreignLoans: [{ creditorStateId: 2, principal: 20, interestRate: 0.02, inDefault: true }],
      lastTradeSanctionBlocked: 0
    } as unknown as State;
    const creditor = { i: 2, treasury: 10 } as unknown as State;
    worldContext.pack = {
      states: [undefined, state, creditor],
      burgs: [],
      characters: []
    } as unknown as PackedGraph;

    refreshTradeSanctions(state);
    expect(state.tradeSanctionMult).toBeLessThan(1);
    expect(state.tradeSanctionMult).toBeCloseTo(TRADE_SANCTION_BASE_MULT - 0.04, 2);

    const kept = applyTradeSanctionToIncome(state, 100);
    expect(kept).toBeLessThan(100);
    expect(state.lastTradeSanctionBlocked).toBeGreaterThan(0);
    expect(creditor.treasury).toBeGreaterThan(10);
  });
});
