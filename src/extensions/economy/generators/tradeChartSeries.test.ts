import { describe, expect, it } from "vitest";
import {
  collectTradeContributions,
  readTradeContributions,
  type TradeChartBurg,
  type TradeChartCorridor,
  type TradeChartGood
} from "./tradeChartSeries";

const grain: TradeChartGood = {
  id: 7,
  value: 5,
  kgPerUnit: 465,
  cargoSlotsPerUnit: 2,
  heading: "Food"
};

function burg(id: number, state: number, culture: number): TradeChartBurg {
  return { id, state, culture, province: 0, religion: 0, biome: 0 };
}

function corridor(patch: Partial<TradeChartCorridor> = {}): TradeChartCorridor {
  return {
    burgA: 1,
    burgB: 2,
    value: 40,
    cargoSlots: 10,
    goodsSlots: { "7": 8 },
    ...patch
  };
}

const burgs = [null, burg(1, 1, 3), burg(2, 1, 4)];

describe("trade chart series", () => {
  it("prices both ends from recorded money and sums them into one state", () => {
    const rows = collectTradeContributions({
      basis: "price",
      entity: "states",
      groupBy: "cultures",
      corridors: [corridor()],
      burgs,
      goods: [grain]
    });
    expect(rows).toEqual([
      { entityId: 1, groupKey: "3", value: 40 },
      { entityId: 1, groupKey: "4", value: 40 }
    ]);
  });

  it("prices a shipment that stored no money at catalogue value", () => {
    const rows = collectTradeContributions({
      basis: "price",
      entity: "burgs",
      groupBy: "burgs",
      corridors: [corridor({ value: 0 })],
      burgs,
      goods: [grain]
    });
    expect(rows).toEqual([
      { entityId: 1, groupKey: "1", value: 20 },
      { entityId: 2, groupKey: "2", value: 20 }
    ]);
  });

  it("includes unpriced shipments when the same corridor also has paid trade", () => {
    const rows = collectTradeContributions({
      basis: "price",
      entity: "burgs",
      groupBy: "burgs",
      corridors: [corridor({ value: 40, unpricedValue: 20 })],
      burgs,
      goods: [grain]
    });
    expect(rows).toEqual([
      { entityId: 1, groupKey: "1", value: 60 },
      { entityId: 2, groupKey: "2", value: 60 }
    ]);
  });

  it("weights units and spreads the unlisted slot tail at the known rate", () => {
    const rows = collectTradeContributions({
      basis: "weight",
      entity: "burgs",
      groupBy: "states",
      corridors: [corridor()],
      burgs,
      goods: [grain]
    });
    expect(rows).toEqual([
      { entityId: 1, groupKey: "1", value: 2325 },
      { entityId: 2, groupKey: "1", value: 2325 }
    ]);
  });

  it("counts every slot under one heading and keeps the unlisted tail", () => {
    const rows = collectTradeContributions({
      basis: "tags",
      entity: "states",
      groupBy: "cultures",
      corridors: [corridor()],
      burgs,
      goods: [{ ...grain, heading: "Beverages" }]
    });
    expect(rows).toEqual([
      { entityId: 1, groupKey: "Beverages", value: 16 },
      { entityId: 1, groupKey: "Other", value: 4 }
    ]);
  });

  it("drops a removed end and gives each distinct state its own full share", () => {
    const rows = collectTradeContributions({
      basis: "price",
      entity: "states",
      groupBy: "states",
      corridors: [corridor()],
      burgs: [null, burg(1, 1, 3), null, burg(3, 5, 4)],
      goods: [grain]
    });
    expect(rows).toEqual([{ entityId: 1, groupKey: "1", value: 40 }]);

    const across = collectTradeContributions({
      basis: "price",
      entity: "states",
      groupBy: "states",
      corridors: [corridor({ burgB: 3 })],
      burgs: [null, burg(1, 1, 3), null, burg(3, 5, 4)],
      goods: [grain]
    });
    expect(across).toEqual([
      { entityId: 1, groupKey: "1", value: 40 },
      { entityId: 5, groupKey: "5", value: 40 }
    ]);
  });

  it("returns null before the economy context is ready", () => {
    expect(readTradeContributions({ basis: "price", entity: "burgs", groupBy: "cultures" })).toBeNull();
  });
});
