import { describe, expect, it } from "vitest";
import { createGoodsFlowObservation } from "./goodsFlowObservation";

describe("per-good flow observation", () => {
  it("separates production, warehouse bookings, matching refusals and physical departure legs", () => {
    const observation = createGoodsFlowObservation();
    observation.flow({ goodId: 1, direction: "source", category: "burgCraft", units: 0.0001 }, 3.4);
    observation.flow({ goodId: 1, direction: "sink", category: "exportDeparture", units: 2 }, 3.4);
    observation.stage({ stage: "noTransport", goodId: 1, exporterId: 1, importerId: 2, transportLimit: "sea" });
    observation.stage({ stage: "deal", goodId: 1, exporterId: 1, importerId: 2, units: 2, value: 7 });
    const payload = [
      { goodId: 1, units: 0.5, value: 1.75, cargoSlotsPerUnit: 2 },
      { goodId: 1, units: 0.5, value: 1.75, cargoSlotsPerUnit: 2 }
    ];
    observation.departure({ payload });
    observation.departure({ payload });
    // Walking livestock also depart, without a vehicle reservation or cargo slots.
    observation.departure({ payload: [{ goodId: 2, units: 3, value: 9 }] });
    const rows = observation.take();
    expect(rows.get(1)).toEqual({
      flows: {
        "source:burgCraft": { units: 0.0001, value: 0.00034 },
        "sink:exportDeparture": { units: 2, value: 6.8 }
      },
      stages: { noTransport: 1, "noTransport:sea": 1, deal: 1 },
      deals: { count: 1, units: 2, value: 7 },
      departures: { legs: 2, units: 2, value: 7, slots: 4 }
    });
    expect(rows.get(2)?.departures).toEqual({ legs: 1, units: 3, value: 9, slots: 0 });
    expect(observation.take().size).toBe(0);
    expect(rows.size).toBe(2);
  });
});
