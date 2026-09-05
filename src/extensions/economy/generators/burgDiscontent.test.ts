import { afterEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setBurgMarketLedgers } from "../economyContext";
import {
  computeBurgDiscontentDelta,
  DISCONTENT_EFFECT_FLOOR,
  DISCONTENT_LABOR_MULTIPLIER_FLOOR,
  DISCONTENT_OUTFLOW_MAX_RATE,
  EXTRACT_DISCONTENT_GAIN,
  FOOD_DISCONTENT_GAIN_MAX,
  getDiscontentLaborMultiplier,
  getDiscontentOutflowRate,
  LEVY_DISCONTENT_GAIN_MAX,
  settleBurgDiscontent,
  WAR_DISCONTENT_GAIN_MAX
} from "./burgDiscontent";

function healthyInputs(overrides: Partial<Parameters<typeof computeBurgDiscontentDelta>[0]> = {}) {
  return {
    foodSecurity: 1,
    warIntensity: 0,
    levyRate: 1,
    extract: false,
    salesTax: 0.15,
    pollTax: 0.6,
    ecclesiasticaLevel: 1,
    treasurySlack: 1,
    ...overrides
  };
}

describe("burgDiscontent (docs/plan/economy-coupling-audit.md L9-b)", () => {
  it("does not cut labor or push outflow at or below the effect floor", () => {
    expect(getDiscontentLaborMultiplier(undefined)).toBe(1);
    expect(getDiscontentLaborMultiplier(0)).toBe(1);
    expect(getDiscontentLaborMultiplier(DISCONTENT_EFFECT_FLOOR)).toBe(1);
    expect(getDiscontentOutflowRate(undefined)).toBe(0);
    expect(getDiscontentOutflowRate(DISCONTENT_EFFECT_FLOOR)).toBe(0);
  });

  it("reaches the labor floor and max outflow at discontent 100", () => {
    expect(getDiscontentLaborMultiplier(100)).toBeCloseTo(DISCONTENT_LABOR_MULTIPLIER_FLOOR, 4);
    expect(getDiscontentOutflowRate(100)).toBeCloseTo(DISCONTENT_OUTFLOW_MAX_RATE, 6);
  });

  it("decays on a quiet, well-funded burg", () => {
    expect(computeBurgDiscontentDelta(healthyInputs())).toBeLessThan(0);
  });

  it("accumulates from famine, heavy levy, and war, and extract adds more", () => {
    const famine = computeBurgDiscontentDelta(healthyInputs({ foodSecurity: 0 }));
    const levy = computeBurgDiscontentDelta(healthyInputs({ levyRate: 1.5 }));
    const war = computeBurgDiscontentDelta(healthyInputs({ warIntensity: 2.5 }));
    const extract = computeBurgDiscontentDelta(healthyInputs({ levyRate: 1.5, extract: true }));

    expect(famine).toBeGreaterThan(0);
    expect(levy).toBeGreaterThan(0);
    expect(war).toBeGreaterThan(0);
    expect(extract).toBeCloseTo(levy + EXTRACT_DISCONTENT_GAIN, 6);
    expect(famine).toBeGreaterThan(0);
    expect(FOOD_DISCONTENT_GAIN_MAX).toBe(WAR_DISCONTENT_GAIN_MAX);
    expect(LEVY_DISCONTENT_GAIN_MAX).toBeGreaterThan(0);
  });

  it("sinks faster with treasury slack and a funded Ecclesiastica", () => {
    const poor = computeBurgDiscontentDelta(healthyInputs({ treasurySlack: 0, ecclesiasticaLevel: 0 }));
    const rich = computeBurgDiscontentDelta(healthyInputs({ treasurySlack: 1, ecclesiasticaLevel: 1 }));
    expect(rich).toBeLessThan(poor);
  });
});

describe("settleBurgDiscontent()", () => {
  afterEach(() => clearEconomyContext());

  it("writes a clamped burg.discontent and reads warIntensity from the market ledger", () => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = {};
    worldContext.pack = { burgs: [], states: [] } as unknown as PackedGraph;
    setBurgMarketLedgers([{ burgId: 1, marketId: 1, merchants: [], warIntensity: 2.5 }]);

    const burg = {
      i: 1,
      population: 10,
      treasury: 0,
      foodSecurity: 0,
      domainLevyRate: 1.5,
      domainFiscalPolicy: "extract"
    } as Burg;
    const state = {
      i: 1,
      salesTax: 0.25,
      pollTax: 0.9,
      departmentServiceLevel: { ecclesiastica: 0 }
    } as unknown as State;

    const first = settleBurgDiscontent(burg, state);
    expect(first).toBeGreaterThan(0);
    expect(burg.discontent).toBe(first);

    burg.discontent = 99;
    expect(settleBurgDiscontent(burg, state)).toBe(100);
  });
});
