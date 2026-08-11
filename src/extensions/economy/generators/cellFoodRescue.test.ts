import { describe, expect, it } from "vitest";
import { planCellFoodRescue } from "./cellFoodRescue";
import type { CellFreshFoodInput } from "./cellFoodRescueTypes";

const milk: CellFreshFoodInput = {
  sourceGoodId: 1,
  harvestedUnits: 30,
  householdDemandUnits: 2,
  preservationLaborPerUnit: 0.1,
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
