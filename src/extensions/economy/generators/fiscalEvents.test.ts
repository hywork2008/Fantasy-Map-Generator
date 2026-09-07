import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMarkets } from "../economyContext";
import {
  applyFiscalEvents,
  COUNCIL_FAILURE_INCOME_SCALE,
  fiscalEventRoll,
  getTaxFarmPersonalityFactor,
  PUBLIC_DEBT_INTEREST_RATE,
  TAX_FARM_RATE_BY_FORM,
  WAR_DEBT_ISSUE_AMOUNT
} from "./fiscalEvents";
import type { Market } from "./marketTypes";

function makeManager(greed: number, honor: number): Character {
  return {
    i: 9,
    name: "Manager",
    age: 40,
    gender: "male",
    culture: 0,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    dead: false,
    skills: {} as Character["skills"],
    personality: { greed, honor } as Character["personality"],
    family: {} as Character["family"],
    appearance: 50,
    prestige: 40,
    wealth: 10,
    pastTitles: []
  };
}

describe("fiscalEvents (PR-7)", () => {
  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
  });

  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);
    worldContext.pack = { states: [], burgs: [] } as unknown as PackedGraph;
    setMarkets([]);
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

  it("skims tax farm share from L2 into the credit pool for Republic (PR-9)", () => {
    const state = {
      i: 2,
      form: "Republic",
      diplomacy: [],
      treasury: 100,
      capital: 1,
      creditPoolBalance: 10
    } as unknown as State;
    const capital = { i: 1, treasury: 0, removed: false } as unknown as Burg;
    worldContext.pack = { states: [undefined, state], burgs: [undefined, capital] } as unknown as PackedGraph;

    const result = applyFiscalEvents(state, 100);
    // PR-8: farm rate is lightly scaled by assembly support (Republic base ~48).
    expect(result.taxFarmLeak).toBeCloseTo(TAX_FARM_RATE_BY_FORM.Republic! * 100, 0);
    expect(result.taxFarmLeak).toBeGreaterThan(0);
    expect(state.treasury).toBeCloseTo(100 - result.taxFarmLeak, 5);
    // PR-9: majority of farm skim lands in the credit pool, not only the capital burg.
    expect(state.creditPoolBalance).toBeGreaterThan(10);
  });

  it("leaves the tax-farm factor at 1 when greed and honor are neutral", () => {
    expect(getTaxFarmPersonalityFactor(50, 50)).toBe(1);
    expect(getTaxFarmPersonalityFactor(undefined, undefined)).toBe(1);
  });

  it("raises the tax-farm leak for a greedy low-honor capital-market manager", () => {
    const greedy = makeManager(100, 0);
    const honest = makeManager(0, 100);
    const capital = { i: 1, treasury: 0, removed: false } as unknown as Burg;
    const market = {
      i: 1,
      centerBurgId: 1,
      color: "#fff",
      goods: {},
      managerCharacterId: 9
    } as Market;

    const greedyState = {
      i: 2,
      form: "Republic",
      diplomacy: [],
      treasury: 100,
      capital: 1,
      creditPoolBalance: 10
    } as unknown as State;
    worldContext.pack = {
      characters: [greedy],
      states: [undefined, greedyState],
      burgs: [undefined, capital]
    } as unknown as PackedGraph;
    setMarkets([market]);
    const greedyResult = applyFiscalEvents(greedyState, 100);

    const honestState = {
      i: 2,
      form: "Republic",
      diplomacy: [],
      treasury: 100,
      capital: 1,
      creditPoolBalance: 10
    } as unknown as State;
    worldContext.pack = {
      characters: [honest],
      states: [undefined, honestState],
      burgs: [undefined, capital]
    } as unknown as PackedGraph;
    setMarkets([market]);
    const honestResult = applyFiscalEvents(honestState, 100);

    expect(greedyResult.taxFarmLeak).toBeGreaterThan(honestResult.taxFarmLeak);
    expect(getTaxFarmPersonalityFactor(100, 0)).toBeGreaterThan(1);
    expect(getTaxFarmPersonalityFactor(0, 100)).toBeLessThan(1);
  });

  it("services public debt interest from L2 into the credit pool and repays surplus principal", () => {
    const state = {
      i: 3,
      form: "Monarchy",
      diplomacy: [],
      treasury: 50,
      publicDebt: 100,
      creditPoolBalance: 0
    } as unknown as State;

    const result = applyFiscalEvents(state, 0);
    // PR-10: rate is form/greed/support scaled — still near the base monthly rate.
    expect(result.debtInterestPaid).toBeGreaterThan(0);
    expect(result.debtInterestPaid).toBeLessThanOrEqual(100 * PUBLIC_DEBT_INTEREST_RATE * 1.5);
    // After interest, surplus above WAR_DEBT_CASH_THRESHOLD (5) repays principal.
    expect(state.treasury).toBe(5);
    expect(result.debtRepaid).toBeGreaterThan(0);
    expect(state.publicDebt).toBeLessThan(100);
    // Interest + repaid principal returned to moneylenders / pool.
    expect(state.creditPoolBalance).toBeGreaterThan(0);
    expect(state.debtInterestRate).toBeGreaterThan(0);
  });

  it("issues thin war debt from the credit pool when war footing and cash-strapped", () => {
    const state = {
      i: 4,
      form: "Republic",
      diplomacy: ["Enemy"],
      warFooting: true,
      treasury: 0,
      publicDebt: 0,
      creditPoolBalance: 100
    } as unknown as State;

    const result = applyFiscalEvents(state, 0);
    expect(result.debtIssued).toBe(WAR_DEBT_ISSUE_AMOUNT);
    expect(state.publicDebt).toBe(WAR_DEBT_ISSUE_AMOUNT);
    expect(state.treasury).toBe(WAR_DEBT_ISSUE_AMOUNT);
    expect(state.creditPoolBalance).toBe(100 - WAR_DEBT_ISSUE_AMOUNT);
  });

  it("does not issue war debt when the credit pool is empty", () => {
    const state = {
      i: 5,
      form: "Republic",
      diplomacy: ["Enemy"],
      warFooting: true,
      treasury: 0,
      publicDebt: 0,
      creditPoolBalance: 0
    } as unknown as State;

    const result = applyFiscalEvents(state, 0);
    expect(result.debtIssued).toBe(0);
    expect(state.publicDebt || 0).toBe(0);
    expect(state.treasury).toBe(0);
  });
});
