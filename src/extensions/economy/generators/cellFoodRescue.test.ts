import { describe, expect, it } from "vitest";
import { getChilledFreshFoodExportUnits, planCellFoodRescue } from "./cellFoodRescue";
import type { CellFreshFoodInput } from "./cellFoodRescueTypes";

const milk: CellFreshFoodInput = {
  sourceGoodId: 1,
  harvestedUnits: 30,
  householdDemandUnits: 2,
  preservationLaborPerUnit: 0.1,
  emergencyReserveDemandUnits: 0,
  reservePath: { outputGoodId: 2, inputPerOutput: 10 },
  commercialPath: { outputGoodId: 2, inputPerOutput: 10 },
  exportDemandUnits: 5,
  preservationSuppliesAvailable: true
};

describe("planCellFoodRescue", () => {
  it("fills a bounded local reserve before making preserved food for market demand", () => {
    const plan = planCellFoodRescue([milk], {}, 100);
    const [outcome] = plan.outcomes;

    // Three months of two fresh units are kept locally first. The remaining planned capacity
    // may become Cheese for a real commercial request, rather than trapping all output locally.
    expect(outcome.eatenFreshUnits).toBe(2);
    expect(outcome.reserveInputUnits).toBe(6);
    expect(outcome.reserveOutputUnits).toBeCloseTo(0.6);
    expect(outcome.exportOutputUnits).toBeCloseTo(2.2);
    expect(plan.nextReserve[1]).toBe(6);
    expect(plan.processingLaborUsed).toBeCloseTo(2.8);
  });

  it("does not turn the whole cell population into food processors after the reserve is full", () => {
    const plan = planCellFoodRescue([{ ...milk, harvestedUnits: 1_000, exportDemandUnits: 1_000 }], { 1: 6 }, 100);
    const [outcome] = plan.outcomes;

    // The 15-work-unit cap allows 150 raw units at 0.1 work each, never all 1,000.
    expect(outcome.producedUnits).toBe(152);
    expect(plan.processingLaborUsed).toBe(15);
    expect(outcome.exportOutputUnits).toBe(15);
  });

  it("limits raw milk access to five percent of the realised dairy harvest", () => {
    const plan = planCellFoodRescue(
      [{ ...milk, harvestedUnits: 1_000, exportDemandUnits: 1_000, maxFreshHouseholdShare: 0.05 }],
      { 1: 6 },
      100
    );
    const [outcome] = plan.outcomes;

    expect(outcome.eatenFreshUnits).toBe(2);
    expect(outcome.exportOutputUnits).toBe(15);
    expect(outcome.eatenFreshUnits / outcome.producedUnits).toBeLessThanOrEqual(0.05);
  });

  it("keeps Cheese reserves out of normal rural meals until staple food is stressed", () => {
    const normalPlan = planCellFoodRescue([{ ...milk, harvestedUnits: 0 }], { 1: 6 }, 100);
    const emergencyPlan = planCellFoodRescue(
      [{ ...milk, harvestedUnits: 0, emergencyReserveDemandUnits: 2 }],
      { 1: 6 },
      100
    );

    expect(normalPlan.outcomes[0].eatenFreshUnits).toBe(0);
    expect(normalPlan.nextReserve[1]).toBe(6);
    expect(emergencyPlan.outcomes[0].eatenFreshUnits).toBe(2);
    expect(emergencyPlan.nextReserve[1]).toBe(4);
  });

  it("can keep raisins for the local reserve while selling commercial grapes as wine", () => {
    const plan = planCellFoodRescue(
      [
        {
          ...milk,
          sourceGoodId: 3,
          harvestedUnits: 30,
          reservePath: { outputGoodId: 4, inputPerOutput: 1 },
          commercialPath: { outputGoodId: 5, inputPerOutput: 0.26 },
          exportDemandUnits: 100
        }
      ],
      {},
      100
    );
    const [outcome] = plan.outcomes;

    expect(outcome.reserveInputUnits).toBe(6);
    expect(outcome.exportOutputUnits).toBeCloseTo(22 / 0.26);
  });

  it("records spoilage only when planned preservation lacks its reserved physical supplies", () => {
    const plan = planCellFoodRescue([{ ...milk, harvestedUnits: 10, preservationSuppliesAvailable: false }], {}, 100);
    const [outcome] = plan.outcomes;

    expect(outcome.spoiledForMissingSuppliesUnits).toBe(8);
    expect(outcome.reserveInputUnits).toBe(0);
    expect(outcome.exportOutputUnits).toBe(0);
  });
});

// docs/plan/mechanical-refrigeration-and-cold-chain.md §3.6-3.7.
describe("getChilledFreshFoodExportUnits", () => {
  it("rescues exactly the gap planCellFoodRescue left unrecorded, when capacity covers it fully", () => {
    // Same fixture as "does not turn the whole cell population into food processors" above:
    // harvested 1,000, producedUnits 152 — an 848-unit gap the planner never records.
    const plan = planCellFoodRescue([{ ...milk, harvestedUnits: 1_000, exportDemandUnits: 1_000 }], { 1: 6 }, 100);
    const [outcome] = plan.outcomes;

    expect(getChilledFreshFoodExportUnits(1_000, outcome.producedUnits, 10_000)).toBe(848);
  });

  it("caps the rescued amount at the available cold-storage capacity", () => {
    expect(getChilledFreshFoodExportUnits(1_000, 152, 200)).toBe(200);
  });

  it("returns 0 when the harvest was already fully eaten or preserved", () => {
    expect(getChilledFreshFoodExportUnits(30, 30, 100)).toBe(0);
    expect(getChilledFreshFoodExportUnits(10, 12, 100)).toBe(0); // producedUnits never exceeds harvestedUnits in practice
  });

  it("returns 0 when no cold-storage capacity is available", () => {
    expect(getChilledFreshFoodExportUnits(1_000, 152, 0)).toBe(0);
  });

  it("treats non-finite or negative inputs as zero", () => {
    expect(getChilledFreshFoodExportUnits(Number.NaN, 0, 100)).toBe(0);
    expect(getChilledFreshFoodExportUnits(100, 0, -5)).toBe(0);
  });
});
