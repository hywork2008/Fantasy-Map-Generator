import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import {
  applyFiscalEvents,
  COUNCIL_FAILURE_INCOME_SCALE,
  fiscalEventRoll,
  PUBLIC_DEBT_INTEREST_RATE,
  TAX_FARM_RATE_BY_FORM,
  WAR_DEBT_ISSUE_AMOUNT
} from "./fiscalEvents";

describe("fiscalEvents (PR-7)", () => {
  afterEach(() => {
    clearEconomyContext();
  });

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { states: [], burgs: [] } as unknown as PackedGraph;
  });

  it("does not run council failure in peacetime without war footing", () => {
    const state = {
      i: 1,
      form: "Republic",
      diplomacy: [],
      treasury: 100
    } as unknown as State;

    // Force a roll that would fail if wartime (pick income so roll < 18).
    let income = 0;
    for (let i = 0; i < 200; i++) {
      if (fiscalEventRoll(1, i) < 18) {
        income = i;
        break;
      }
    }
    state.treasury = income;
    const result = applyFiscalEvents(state, income);
    expect(result.councilFailed).toBe(false);
    expect(result.incomeScale).toBe(1);
  });

  it("can fail wartime council consent and claw unapproved revenue", () => {
    // Theocracy war-footing: council can fail (3% chance) and does not issue Republic/Monarchy war debt.
    let income = 100;
    let stateId = 1;
    outer: for (let id = 1; id < 40; id++) {
      for (let i = 50; i < 400; i++) {
        if (fiscalEventRoll(id, i) < 3) {
          stateId = id;
          income = i;
          break outer;
        }
      }
    }
    const state = {
      i: stateId,
      form: "Theocracy",
      diplomacy: ["Enemy"],
      warFooting: true,
      treasury: income
    } as unknown as State;

    const result = applyFiscalEvents(state, income);
    expect(result.councilFailed).toBe(true);
    expect(result.incomeScale).toBe(COUNCIL_FAILURE_INCOME_SCALE);
    expect(result.debtIssued).toBe(0);
    // Claw reduces L2; Theocracy tax farm rate is 0.
    expect(state.treasury).toBeLessThan(income);
  });

  it("skims tax farm share from L2 for Republic", () => {
    const state = {
      i: 2,
      form: "Republic",
      diplomacy: [],
      treasury: 100,
      capital: 1
    } as unknown as State;
    const capital = { i: 1, treasury: 0, removed: false } as unknown as Burg;
    worldContext.pack = { states: [undefined, state], burgs: [undefined, capital] } as unknown as PackedGraph;

    const result = applyFiscalEvents(state, 100);
    // PR-8: farm rate is lightly scaled by assembly support (Republic base ~48).
    expect(result.taxFarmLeak).toBeCloseTo(TAX_FARM_RATE_BY_FORM.Republic! * 100, 0);
    expect(result.taxFarmLeak).toBeGreaterThan(0);
    expect(state.treasury).toBeCloseTo(100 - result.taxFarmLeak, 5);
    expect(capital.treasury).toBeCloseTo(result.taxFarmLeak, 5);
  });

  it("services public debt interest from L2 and repays surplus principal down to the cash buffer", () => {
    const state = {
      i: 3,
      form: "Monarchy",
      diplomacy: [],
      treasury: 50,
      publicDebt: 100
    } as unknown as State;

    const result = applyFiscalEvents(state, 0);
    expect(result.debtInterestPaid).toBe(100 * PUBLIC_DEBT_INTEREST_RATE);
    // After interest, surplus above WAR_DEBT_CASH_THRESHOLD (5) repays principal.
    expect(state.treasury).toBe(5);
    expect(result.debtRepaid).toBeGreaterThan(0);
    expect(state.publicDebt).toBeLessThan(100);
  });

  it("issues thin war debt when war footing and cash-strapped", () => {
    const state = {
      i: 4,
      form: "Republic",
      diplomacy: ["Enemy"],
      warFooting: true,
      treasury: 0,
      publicDebt: 0
    } as unknown as State;

    const result = applyFiscalEvents(state, 0);
    expect(result.debtIssued).toBe(WAR_DEBT_ISSUE_AMOUNT);
    expect(state.publicDebt).toBe(WAR_DEBT_ISSUE_AMOUNT);
    expect(state.treasury).toBe(WAR_DEBT_ISSUE_AMOUNT);
  });
});
