import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import {
  clearEconomyContext,
  getStateSecretStocks,
  initEconomyContext,
  setMilitaryResourceLedgers
} from "../economyContext";
import {
  getStateSecretMaterialMultiplier,
  STATE_SECRET_TARGET_ANNUAL_SPEND,
  StateSecretKnowledge
} from "./stateSecretKnowledge";

describe("StateSecretKnowledgeModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 500 };
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, treasury: 1000 } as unknown as State]
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  function ledger(overrides: { stateId?: number; gunpowder?: number } = {}) {
    return {
      stateId: overrides.stateId ?? 1,
      supplyMarketId: null,
      annualDemand: { gunpowder: overrides.gunpowder ?? 1 },
      lastConsumed: {},
      unmetDemand: {}
    };
  }

  it("raises the pyrotechnics stock for a state funding a full-coverage research budget", () => {
    setMilitaryResourceLedgers([ledger()]);

    StateSecretKnowledge.settleAnnual();

    const stock = getStateSecretStocks().find(entry => entry.stateId === 1 && entry.domain === "pyrotechnics");
    expect(stock?.stock).toBeGreaterThan(0);
    expect(getStateSecretMaterialMultiplier(1, "pyrotechnics")).toBeLessThan(1);
  });

  it("spends treasury each year it funds research, capped at the full-coverage target", () => {
    setMilitaryResourceLedgers([ledger()]);

    StateSecretKnowledge.settleAnnual();

    // Treasury is large (1000), so the 5% budget share exceeds the target — spend caps at the target.
    expect(worldContext.pack.states[1].treasury).toBe(1000 - STATE_SECRET_TARGET_ANNUAL_SPEND);
  });

  it("does not spend or grow the stock for a state with no active gunpowder demand", () => {
    setMilitaryResourceLedgers([ledger({ gunpowder: 0 })]);

    StateSecretKnowledge.settleAnnual();

    expect(worldContext.pack.states[1].treasury).toBe(1000);
    expect(getStateSecretStocks().find(entry => entry.stateId === 1)).toBeUndefined();
  });

  it("matures a poorly-funded state's stock slower than a well-funded one", () => {
    worldContext.pack.states = [
      { i: 0 } as unknown as State,
      { i: 1, treasury: 1000 } as unknown as State,
      { i: 2, treasury: 10 } as unknown as State
    ];
    setMilitaryResourceLedgers([ledger({ stateId: 1 }), ledger({ stateId: 2 })]);

    StateSecretKnowledge.settleAnnual();

    const richStock = getStateSecretStocks().find(entry => entry.stateId === 1)?.stock ?? 0;
    const poorStock = getStateSecretStocks().find(entry => entry.stateId === 2)?.stock ?? 0;
    expect(richStock).toBeGreaterThan(poorStock);
  });

  it("decays the stock for a state whose gunpowder demand drops to zero", () => {
    setMilitaryResourceLedgers([ledger()]);
    StateSecretKnowledge.settleAnnual();
    const stockAfterFirstYear = getStateSecretStocks().find(entry => entry.stateId === 1)?.stock ?? 0;
    expect(stockAfterFirstYear).toBeGreaterThan(0);

    setMilitaryResourceLedgers([ledger({ gunpowder: 0 })]);
    worldContext.options = { year: 501 };
    StateSecretKnowledge.settleAnnual();

    const stockAfterDecay = getStateSecretStocks().find(entry => entry.stateId === 1)?.stock ?? 0;
    expect(stockAfterDecay).toBeLessThan(stockAfterFirstYear);
  });

  it("keeps decaying an orphaned state's stock after its ledger disappears", () => {
    setMilitaryResourceLedgers([ledger()]);
    StateSecretKnowledge.settleAnnual();
    const stockWithLedger = getStateSecretStocks().find(entry => entry.stateId === 1)?.stock ?? 0;
    expect(stockWithLedger).toBeGreaterThan(0);

    setMilitaryResourceLedgers([]);
    worldContext.options = { year: 501 };
    StateSecretKnowledge.settleAnnual();

    const orphanStock = getStateSecretStocks().find(entry => entry.stateId === 1)?.stock ?? 0;
    expect(orphanStock).toBeGreaterThan(0);
    expect(orphanStock).toBeLessThan(stockWithLedger);
  });

  it("is a no-op the second time it is called within the same simulation year", () => {
    setMilitaryResourceLedgers([ledger()]);

    StateSecretKnowledge.settleAnnual();
    const treasuryAfterFirstCall = worldContext.pack.states[1].treasury;
    StateSecretKnowledge.settleAnnual();

    expect(worldContext.pack.states[1].treasury).toBe(treasuryAfterFirstCall);
  });

  it("returns multiplier 1 (no reduction) for a State with no tracked stock", () => {
    expect(getStateSecretMaterialMultiplier(999, "pyrotechnics")).toBe(1);
  });
});
