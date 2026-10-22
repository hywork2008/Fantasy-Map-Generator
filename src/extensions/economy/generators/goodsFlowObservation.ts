/** Read-only, interval-scoped per-good observations; bookings and physical departures stay separate. */
import type { GoodFlowRecord } from "./goodsBalanceLedger";
import type { CargoDepartureEvent, TradeStageEvent } from "./tradeStageObserver";

export function createGoodsFlowObservation() {
  type Amount = { units: number; value: number };
  type Row = {
    flows: Record<string, Amount>;
    stages: Record<string, number>;
    deals: Amount & { count: number };
    departures: Amount & { legs: number; slots: number };
  };
  let rows = new Map<number, Row>();
  const row = (id: number) => {
    let result = rows.get(id);
    if (!result) {
      result = {
        flows: {},
        stages: {},
        deals: { count: 0, units: 0, value: 0 },
        departures: { legs: 0, units: 0, value: 0, slots: 0 }
      };
      rows.set(id, result);
    }
    return result;
  };
  return {
    flow(flow: GoodFlowRecord, price: number) {
      const flows = row(flow.goodId).flows;
      const key = `${flow.direction}:${flow.category}`;
      flows[key] ??= { units: 0, value: 0 };
      const amount = flows[key];
      amount.units += flow.units;
      amount.value += flow.units * price;
    },
    stage(event: TradeStageEvent) {
      const entry = row(event.goodId);
      entry.stages[event.stage] = (entry.stages[event.stage] ?? 0) + 1;
      if (event.transportLimit) {
        const key = `${event.stage}:${event.transportLimit}`;
        entry.stages[key] = (entry.stages[key] ?? 0) + 1;
      }
      if (event.stage === "deal") {
        entry.deals.count++;
        entry.deals.units += event.units ?? 0;
        entry.deals.value += event.value ?? 0;
      }
    },
    departure(event: CargoDepartureEvent) {
      const seen = new Set<number>();
      for (const item of event.payload) {
        const entry = row(item.goodId).departures;
        if (!seen.has(item.goodId)) entry.legs++;
        seen.add(item.goodId);
        entry.units += item.units;
        entry.value += item.value;
        entry.slots += item.units * (item.cargoSlotsPerUnit ?? 0);
      }
    },
    take() {
      const result = rows;
      rows = new Map();
      return result;
    }
  };
}
