import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import {
  clearEconomyContext,
  getHusbandryMonthlyWorkDays,
  initEconomyContext,
  setHusbandryMonthlyWorkDays,
  setHusbandryWorkers
} from "../economyContext";
import { WORKABLE_DAYS_PER_ADULT } from "./agriculturalLandUse";
import type { HusbandryDemand } from "./husbandry";
import { getHusbandryLaborBudget } from "./husbandryLabor";

const demand: HusbandryDemand = {
  requiredWorkers: 1,
  value: 1,
  hayWorkers: 0.2,
  hayMonthlyLaborWeights: Array(12).fill(1 / 12),
  slaughterWorkers: 0.2,
  slaughterMonthlyLaborWeights: Array(12).fill(1 / 12),
  monthlyLaborWeights: Array(12).fill(1 / 12)
};

describe("shared reserved husbandry work", () => {
  beforeEach(() => {
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    worldContext.pack = { cells: { i: Uint16Array.from([0]) } } as never;
    setHusbandryWorkers(Float32Array.from([1]));
  });
  afterEach(() => clearEconomyContext());

  it("uses the actual peak-month reservation instead of an annual average", () => {
    const calendar = new Float32Array(12);
    calendar[9] = WORKABLE_DAYS_PER_ADULT / 4;
    setHusbandryMonthlyWorkDays(calendar);
    const labor = getHusbandryLaborBudget(0, 9, demand);
    expect(labor.basis).toBe("calendar");
    expect(labor.reservedDays).toBeCloseTo(WORKABLE_DAYS_PER_ADULT / 4);
    expect(labor.reservedDays).toBeGreaterThan(WORKABLE_DAYS_PER_ADULT / 12);
    expect(labor.careDays + labor.hayCapacityDays).toBeLessThanOrEqual(labor.reservedDays);
  });

  it("does not invent average labor for an explicitly unreserved month", () => {
    setHusbandryMonthlyWorkDays(new Float32Array(12));
    expect(getHusbandryLaborBudget(0, 9, demand)).toMatchObject({
      basis: "calendar",
      reservedDays: 0,
      careDays: 0,
      hayCapacityDays: 0
    });
  });

  it("retains a marked legacy fallback and invalidates a calendar when workers are edited", () => {
    expect(getHusbandryLaborBudget(0, 9, demand)).toMatchObject({
      basis: "legacy-average",
      reservedDays: WORKABLE_DAYS_PER_ADULT / 12
    });
    setHusbandryMonthlyWorkDays(new Float32Array(12).fill(10));
    setHusbandryWorkers(Float32Array.from([0]));
    expect(getHusbandryMonthlyWorkDays()).toHaveLength(0);
    expect(getHusbandryLaborBudget(0, 9, demand).reservedDays).toBe(0);
  });

  it("gives care priority and bounds hay by the same reservation", () => {
    setHusbandryMonthlyWorkDays(new Float32Array(12).fill(0.5));
    const labor = getHusbandryLaborBudget(0, 9, demand);
    expect(labor.careRequiredDays).toBeGreaterThan(0.5);
    expect(labor.careDays).toBe(0.5);
    expect(labor.hayCapacityDays).toBe(0);
  });
  it("keeps explicitly requested residue work available rather than charging it again as routine care", () => {
    setHusbandryMonthlyWorkDays(new Float32Array(12).fill(20));
    const budget = getHusbandryLaborBudget(0, 9, {
      ...demand,
      residueWorkers: 0.1,
      residueMonthlyLaborWeights: Array(12).fill(1 / 12)
    });
    expect(budget.careRequiredDays).toBeCloseTo((WORKABLE_DAYS_PER_ADULT * 0.5) / 12);
    expect(budget.reservedDays - budget.careDays - budget.hayCapacityDays).toBeGreaterThan(0);
  });
  it("uses the actual monthly hay reservation rather than capping it by annual mean employment", () => {
    setHusbandryWorkers(Float32Array.from([0.01]));
    const calendar = new Float32Array(12);
    calendar[9] = 20;
    setHusbandryMonthlyWorkDays(calendar);
    const labor = getHusbandryLaborBudget(0, 9, demand);
    expect(labor.hayCapacityDays).toBeCloseTo((WORKABLE_DAYS_PER_ADULT * 0.2) / 12);
    expect(labor.workerMonths).toBeCloseTo(20 / (WORKABLE_DAYS_PER_ADULT / 12));
    expect(getHusbandryLaborBudget(0, 8, demand).workerMonths).toBe(0);
  });
});
