import { describe, expect, it } from "vitest";
import type { ProcurementOrder } from "./strategicProcurement";
import {
  getStrategicDemandMultiplier,
  getStrategicLaborAllocationWeight,
  getStrategicProductionDemandByGood
} from "./strategicProductionDemand";

function order(overrides: Partial<ProcurementOrder> = {}): ProcurementOrder {
  return {
    id: 1,
    stateId: 1,
    destinationMarketId: 10,
    goodId: 7,
    requestedUnits: 1,
    fulfilledUnits: 0,
    maxLandedUnitPrice: 2,
    status: "blocked",
    priorityCycles: 1,
    ...overrides
  };
}

describe("strategic production demand", () => {
  it("groups unfulfilled local orders and keeps their continuity", () => {
    const demand = getStrategicProductionDemandByGood(
      [order({ requestedUnits: 0.4, priorityCycles: 3 }), order({ id: 2, requestedUnits: 0.2, priorityCycles: 5 })],
      10
    );

    expect(demand.get(7)).toEqual({ goodId: 7, outstandingUnits: 0.6000000000000001, priorityCycles: 5 });
  });

  it("moves dispatched demand to the supplier market so it can replenish exported stock", () => {
    const inTransit = order({ status: "inTransit", sourceMarketId: 4, requestedUnits: 0.4 });

    expect(getStrategicProductionDemandByGood([inTransit], 10).size).toBe(0);
    expect(getStrategicProductionDemandByGood([inTransit], 4).get(7)?.outstandingUnits).toBe(0.4);
  });

  it("ignores fulfilled and cancelled orders", () => {
    const demand = getStrategicProductionDemandByGood(
      [order({ status: "fulfilled" }), order({ id: 2, status: "cancelled" })],
      10
    );

    expect(demand.size).toBe(0);
  });

  it("marks local Metallurg procurement as State-funded production", () => {
    const demand = getStrategicProductionDemandByGood([order({ purpose: "metallurg" })], 10);

    expect(demand.get(7)).toMatchObject({ stateFunded: true });
  });

  it("defers strategic priority while population demand is unfulfilled and then rewards continuity", () => {
    const initial = { goodId: 7, outstandingUnits: 0.4, priorityCycles: 1 };
    const continuing = { ...initial, priorityCycles: 8 };

    expect(getStrategicDemandMultiplier(initial, true)).toBe(1);
    expect(getStrategicDemandMultiplier(continuing, false)).toBeGreaterThan(
      getStrategicDemandMultiplier(initial, false)
    );
  });

  it("caps one oversized backlog so it cannot monopolize strategic labor", () => {
    const tools = { goodId: 6, outstandingUnits: 18_000, priorityCycles: 1 };
    const muskets = { goodId: 9, outstandingUnits: 6, priorityCycles: 2 };

    expect(getStrategicLaborAllocationWeight(tools)).toBe(2);
    expect(getStrategicLaborAllocationWeight(muskets)).toBeGreaterThan(getStrategicLaborAllocationWeight(tools));
  });
});
