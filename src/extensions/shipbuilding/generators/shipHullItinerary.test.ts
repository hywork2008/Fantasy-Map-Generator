import { beforeEach, describe, expect, it } from "vitest";
import type { Burg, State } from "../../hostTypes";
import {
  applyCaravanHullPositions,
  clearShipyardQueues,
  getHulls,
  registerCompletedHull,
  releaseMerchantHullsFromCargo,
  releaseStateHullsFromOverseasEscort,
  reserveMerchantHullsForCargo,
  reserveStateHullsForOverseasEscort
} from "./shipyardQueue";

function makeBurg(partial: Partial<Burg> & { i: number }): Burg {
  return { x: 0, y: 0, cell: 0, ...partial } as Burg;
}

describe("ship hull itinerary (finite fleet P1)", () => {
  beforeEach(() => {
    clearShipyardQueues();
  });

  it("registers market hulls idle at home and state hulls on patrol when at peace", () => {
    const home = makeBurg({ i: 1, state: 1 });
    const capital = makeBurg({ i: 2, state: 1, capital: 1 });
    const states = [{}, { i: 1, diplomacy: [] }] as State[];

    const merchant = registerCompletedHull({
      burg: home,
      owner: "market",
      shipClassId: "sloop",
      states,
      emitCompletedEvent: false
    });
    const navy = registerCompletedHull({
      burg: capital,
      owner: "state",
      shipClassId: "sloop",
      states,
      emitCompletedEvent: false
    });

    expect(merchant).toMatchObject({
      status: "docked",
      duty: "idle",
      currentBurgId: 1,
      nextBurgId: null
    });
    expect(navy).toMatchObject({ status: "voyage", duty: "patrol", currentBurgId: null });
  });

  it("binds a merchant hull to cargo, projects progress, then berths idle at destination", () => {
    const home = makeBurg({ i: 1, state: 1 });
    const dest = makeBurg({ i: 3, state: 2 });
    const states = [{}, { i: 1 }, { i: 2 }] as State[];
    const hull = registerCompletedHull({
      burg: home,
      owner: "market",
      shipClassId: "sloop",
      states,
      emitCompletedEvent: false
    });

    expect(
      reserveMerchantHullsForCargo({
        hullIds: [hull.id],
        caravanId: 42,
        originBurgId: home.i,
        destinationBurgId: dest.i
      })
    ).toBe(true);

    const atSea = getHulls()[0];
    expect(atSea).toMatchObject({
      status: "cargo",
      duty: "cargo",
      caravanId: 42,
      currentBurgId: null,
      nextBurgId: dest.i,
      routeProgress: 0
    });

    applyCaravanHullPositions([
      {
        hullId: hull.id,
        caravanId: 42,
        originBurgId: home.i!,
        destinationBurgId: dest.i!,
        progress: 0.4,
        phase: "transit"
      }
    ]);
    expect(getHulls()[0].routeProgress).toBeCloseTo(0.4);

    expect(
      releaseMerchantHullsFromCargo({
        hullIds: [hull.id],
        outcome: "arrived",
        destinationBurgId: dest.i
      })
    ).toBe(true);

    expect(getHulls()[0]).toMatchObject({
      status: "docked",
      duty: "idle",
      currentBurgId: dest.i,
      nextBurgId: null,
      caravanId: null,
      routeProgress: 0
    });

    // Reusable for a later cargo leg.
    expect(
      reserveMerchantHullsForCargo({
        hullIds: [hull.id],
        caravanId: 43,
        originBurgId: dest.i,
        destinationBurgId: home.i
      })
    ).toBe(true);
    expect(getHulls()[0].caravanId).toBe(43);
  });

  it("commits a navy hull to an overseas escort, then returns it to patrol", () => {
    const home = makeBurg({ i: 1, state: 1, capital: 1 });
    const hull = registerCompletedHull({
      burg: home,
      owner: "state",
      shipClassId: "caravel",
      states: [{}, { i: 1, diplomacy: [] }] as State[],
      emitCompletedEvent: false
    });

    expect(reserveStateHullsForOverseasEscort({ stateId: 1, expeditionId: 44, hullIds: [hull.id] })).toBe(true);
    expect(getHulls()[0]).toMatchObject({ status: "voyage", duty: "overseas", overseasExpeditionId: 44 });
    expect(reserveStateHullsForOverseasEscort({ stateId: 1, expeditionId: 45, hullIds: [hull.id] })).toBe(false);

    expect(releaseStateHullsFromOverseasEscort({ expeditionId: 44, hullIds: [hull.id], outcome: "arrived" })).toBe(
      true
    );
    expect(getHulls()[0]).toMatchObject({ status: "voyage", duty: "patrol", overseasExpeditionId: null });
  });

  it("puts a lost cargo hull into maintenance without abstract voyage status", () => {
    const home = makeBurg({ i: 1, state: 1 });
    const hull = registerCompletedHull({
      burg: home,
      owner: "market",
      shipClassId: "sloop",
      states: [{}, { i: 1 }] as State[],
      emitCompletedEvent: false
    });
    reserveMerchantHullsForCargo({
      hullIds: [hull.id],
      caravanId: 9,
      originBurgId: 1,
      destinationBurgId: 2
    });

    releaseMerchantHullsFromCargo({ hullIds: [hull.id], outcome: "lost", destinationBurgId: 2 });
    expect(getHulls()[0]).toMatchObject({
      status: "maintenance",
      caravanId: null,
      maintenanceDays: 30
    });
  });
});
