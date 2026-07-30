import type { ProcurementOrder } from "./strategicProcurementTypes";

export interface StrategicProductionDemand {
  goodId: number;
  outstandingUnits: number;
  priorityCycles: number;
}

const MAX_OUTSTANDING_UNITS_PRIORITY = 2;
const MAX_CONTINUITY_PRIORITY = 1.5;

/**
 * Turns unfulfilled public procurement into a local production signal.
 *
 * Orders which are still looking for a supplier stimulate their destination market.
 * Cargo already dispatched stimulates its source market instead, so that market can
 * replenish the stock it physically exported. Fulfilled and cancelled orders no
 * longer affect either market.
 */
export function getStrategicProductionDemandByGood(
  orders: readonly ProcurementOrder[],
  marketId: number
): ReadonlyMap<number, StrategicProductionDemand> {
  const demandByGood = new Map<number, StrategicProductionDemand>();

  for (const order of orders) {
    if (!isProductionRelevantOrder(order, marketId)) continue;

    const outstandingUnits = Math.max(0, order.requestedUnits - order.fulfilledUnits);
    if (outstandingUnits <= 0.001) continue;

    const existing = demandByGood.get(order.goodId);
    if (existing) {
      existing.outstandingUnits += outstandingUnits;
      existing.priorityCycles = Math.max(existing.priorityCycles, order.priorityCycles ?? 1);
      continue;
    }

    demandByGood.set(order.goodId, {
      goodId: order.goodId,
      outstandingUnits,
      priorityCycles: order.priorityCycles ?? 1
    });
  }

  return demandByGood;
}

/**
 * Population demand remains the primary safety mechanism. A strategic order receives
 * no additional score until the current burg has covered its highest-priority normal
 * demand category. Afterwards, both a larger shortage and a longer-lived order raise
 * the expected sale value, with a cap that keeps one order from monopolizing workers.
 */
export function getStrategicDemandMultiplier(
  demand: StrategicProductionDemand | undefined,
  hasUnfulfilledPopulationDemand: boolean
): number {
  if (!demand || hasUnfulfilledPopulationDemand) return 1;

  const outstandingPriority = Math.min(MAX_OUTSTANDING_UNITS_PRIORITY, demand.outstandingUnits * 2);
  const continuityPriority = Math.min(MAX_CONTINUITY_PRIORITY, Math.max(0, demand.priorityCycles - 1) * 0.1);
  return 1 + outstandingPriority + continuityPriority;
}

function isProductionRelevantOrder(order: ProcurementOrder, marketId: number): boolean {
  if (order.status === "inTransit") return order.sourceMarketId === marketId;

  return (
    (order.status === "open" || order.status === "assigned" || order.status === "blocked") &&
    order.destinationMarketId === marketId
  );
}
