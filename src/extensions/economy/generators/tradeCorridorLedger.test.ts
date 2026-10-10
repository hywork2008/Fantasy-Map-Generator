import { describe, expect, it } from "vitest";
import {
  applyCorridorMovement,
  CORRIDOR_ANNUAL_RETENTION,
  type CorridorMovement,
  decayCorridors,
  listCorridorNeeds,
  type TradeCorridor,
  tradePartnersForBurg
} from "./tradeCorridorLedger";

function movement(patch: Partial<CorridorMovement> = {}): CorridorMovement {
  return {
    originBurgId: 2,
    destinationBurgId: 9,
    cargoSlots: 10,
    value: 4,
    modeShare: { land: 1, river: 0, sea: 0 },
    observedDays: 12,
    idealDays: 10,
    routeIds: [3],
    ferryCrossings: 1,
    goods: [{ id: 7, slots: 10 }],
    ...patch
  };
}

describe("trade corridor ledger", () => {
  it("keeps an undirected pair and splits cargo by the path", () => {
    const sea = applyCorridorMovement(
      [],
      movement({
        originBurgId: 9,
        destinationBurgId: 2,
        cargoSlots: 8,
        modeShare: { land: 1, river: 0, sea: 3 },
        routeIds: []
      })
    );
    expect(sea).toHaveLength(1);
    expect(sea[0].burgA).toBe(2);
    expect(sea[0].burgB).toBe(9);
    expect(sea[0].byMode.sea).toBe(6);
    expect(sea[0].byMode.land).toBe(2);
    expect(sea[0].departures).toBe(1);
  });

  it("decays stocks by the same retention as route traffic and drops an empty pair", () => {
    const recorded = applyCorridorMovement([], movement({ cargoSlots: 0.1, value: 1, goods: [] }));
    const faded = decayCorridors(recorded);
    expect(faded[0].departures).toBeCloseTo(CORRIDOR_ANNUAL_RETENTION, 3);
    expect(faded[0].cargoSlots).toBeCloseTo(0.1 * CORRIDOR_ANNUAL_RETENTION, 3);

    const dust = decayCorridors([
      { ...recorded[0], departures: 0.02, cargoSlots: 0.02, byMode: { land: 0.02, river: 0, sea: 0 } }
    ]);
    expect(dust).toEqual([]);
  });

  it("flags a sea pair whose harbour works are thin, and ranks cargo", () => {
    let corridors: TradeCorridor[] = [];
    corridors = applyCorridorMovement(
      corridors,
      movement({
        originBurgId: 1,
        destinationBurgId: 4,
        cargoSlots: 30,
        modeShare: { land: 0, river: 0, sea: 1 },
        routeIds: [],
        ferryCrossings: 0,
        observedDays: 5,
        idealDays: 5
      })
    );
    corridors = applyCorridorMovement(corridors, movement({ cargoSlots: 5 }));
    const needs = listCorridorNeeds(corridors, {
      name: id => (id === 1 ? "Hajsatad" : id === 4 ? "Tegrad" : "Paris"),
      harbor: () => 0
    });
    expect(needs[0]).toMatchObject({
      nameA: "Hajsatad",
      nameB: "Tegrad",
      mode: "sea",
      harborShort: true,
      demand: 1
    });
    expect(needs[1].demand).toBe(0.5);
    expect(needs[1].ferryShare).toBe(1);
    expect(needs[1].delay).toBe(1.2);
  });

  it("lists the busiest partners of one burg", () => {
    let corridors: TradeCorridor[] = [];
    corridors = applyCorridorMovement(corridors, movement({ originBurgId: 1, destinationBurgId: 4, cargoSlots: 3 }));
    corridors = applyCorridorMovement(
      corridors,
      movement({ originBurgId: 8, destinationBurgId: 1, cargoSlots: 12, routeIds: [15], goods: [{ id: 2, slots: 12 }] })
    );
    const partners = tradePartnersForBurg(1, corridors, {
      name: id => (id === 8 ? "Blikstad" : "Gravden"),
      goodName: id => (id === 2 ? "Grain" : "Salt")
    });
    expect(partners.map(partner => partner.burgId)).toEqual([8, 4]);
    expect(partners[0]).toMatchObject({
      name: "Blikstad",
      annualSlots: 12,
      routeId: 15,
      mainGoods: ["Grain"]
    });
  });
});
