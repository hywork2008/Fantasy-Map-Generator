import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setFlowCycleHistory } from "../economyContext";
import type { TransportAllocation } from "./marketTypes";
import { MerchantTransportAssets } from "./merchantTransportAssets";

const CART_ALLOCATION: TransportAllocation = {
  mode: "land",
  transportId: "cart",
  transportName: "Cart",
  unitCount: 1,
  capacitySlots: 80,
  usedSlots: 40,
  draftAnimalId: "horse",
  requiredDraftAnimals: 1
};

const SLOOP_ALLOCATION: TransportAllocation = {
  mode: "water",
  transportId: "sloop",
  transportName: "Sloop",
  unitCount: 1,
  capacitySlots: 100,
  usedSlots: 75
};

const RIVER_BARGE_ALLOCATION: TransportAllocation = {
  mode: "river",
  transportId: "river-barge",
  transportName: "River barge",
  unitCount: 1,
  capacitySlots: 160,
  usedSlots: 100
};

describe("merchant transport assets", () => {
  const reservedHullIds: number[] = [];
  const releasedHullIds: number[] = [];
  const reserveHullListener = (event: Event) => {
    const detail = (event as CustomEvent<{ hullIds: number[]; result?: string }>).detail;
    reservedHullIds.push(...detail.hullIds);
    detail.result = "fulfilled";
  };
  const releaseHullListener = (event: Event) => {
    const detail = (event as CustomEvent<{ hullIds: number[]; result?: string }>).detail;
    releasedHullIds.push(...detail.hullIds);
    detail.result = "fulfilled";
  };

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [{ i: 0 } as Burg, { i: 1, market: 1, population: 100 } as Burg, { i: 2, market: 2 } as Burg],
      markets: [
        { i: 1, centerBurgId: 1, color: "#000", goods: {} },
        { i: 2, centerBurgId: 2, color: "#111", goods: {} }
      ]
    } as unknown as PackedGraph;
    reservedHullIds.length = 0;
    releasedHullIds.length = 0;
    document.addEventListener("fmg:shipbuilding-merchant-hull-reservation-request", reserveHullListener);
    document.addEventListener("fmg:shipbuilding-merchant-hull-release-request", releaseHullListener);
  });

  afterEach(() => {
    MerchantTransportAssets.clear();
    document.removeEventListener("fmg:shipbuilding-merchant-hull-reservation-request", reserveHullListener);
    document.removeEventListener("fmg:shipbuilding-merchant-hull-release-request", releaseHullListener);
    clearEconomyContext();
  });

  it("reserves one market asset at a time and returns it on arrival", () => {
    const initial = MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "cart");
    expect(initial?.available).toBeGreaterThan(0);

    const reservation = MerchantTransportAssets.reserve(1, 10, [CART_ALLOCATION]);
    expect(reservation).not.toBeNull();
    expect(MerchantTransportAssets.reserve(1, 11, [CART_ALLOCATION])).toBeNull();

    MerchantTransportAssets.depart(reservation?.reservation.id ?? -1);
    const inTransit = MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "cart");
    expect(inTransit?.inTransit).toBe(1);

    MerchantTransportAssets.settleCaravan({ transportReservationId: reservation?.reservation.id }, "arrived");
    const returned = MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "cart");
    expect(returned?.available).toBe(initial?.available);
    expect(returned?.inTransit).toBe(0);
  });

  it("places assets from lost caravans in maintenance before recovering them", () => {
    const reservation = MerchantTransportAssets.reserve(1, 10, [CART_ALLOCATION]);
    expect(reservation).not.toBeNull();
    MerchantTransportAssets.depart(reservation?.reservation.id ?? -1);
    MerchantTransportAssets.settleCaravan({ transportReservationId: reservation?.reservation.id }, "lost");

    expect(MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "cart")?.maintenance).toBe(1);
    MerchantTransportAssets.recoverMaintenance(29);
    expect(MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "cart")?.maintenance).toBe(1);
    MerchantTransportAssets.recoverMaintenance(1);
    const recovered = MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "cart");
    expect(recovered?.maintenance).toBe(0);
    expect(recovered?.available).toBeGreaterThan(0);
  });

  it("uses a burg's home market as the stable dispatcher", () => {
    expect(MerchantTransportAssets.getDispatcherMarketId({ seller: 1, sellerType: "burg" })).toBe(1);
    expect(MerchantTransportAssets.getDispatcherMarketId({ seller: 1, sellerType: "market" })).toBe(1);
  });

  it("seeds land fleets at least to the burg floor", () => {
    const availability = MerchantTransportAssets.getAvailability(1);
    const pack = availability.find(asset => asset.assetId === "pack-train");
    const cart = availability.find(asset => asset.assetId === "cart");
    const wagon = availability.find(asset => asset.assetId === "wagon");
    // One burg → legacy floor pack=1, cart=1, wagon=1
    expect(pack?.total).toBeGreaterThanOrEqual(1);
    expect(cart?.total).toBeGreaterThanOrEqual(1);
    expect(wagon?.total).toBeGreaterThanOrEqual(1);
  });

  it("tops up fleets from measured export demand without shrinking", () => {
    const ledger = MerchantTransportAssets.ensureLedger(1);
    expect(ledger).not.toBeNull();
    const cartBefore = ledger!.landAssets.find(asset => asset.assetId === "cart")!;
    const baseline = cartBefore.available + cartBefore.reserved + cartBefore.inTransit + cartBefore.maintenance;

    // Inject A0 history with large export slots for market 1 (3+ cycles).
    setFlowCycleHistory(
      [0, 1, 2].map(cycleIndex => ({
        cycleIndex,
        year: 1000,
        month: cycleIndex + 1,
        day: 1,
        samples: [
          {
            marketId: 1,
            goodId: 1,
            cycleDemand: 10,
            cycleProduction: 50,
            cycleExport: 40,
            cycleImport: 0,
            endStock: 20,
            cargoSlotsPerUnit: 5,
            monthsOfCover: 2
          }
        ]
      }))
    );

    MerchantTransportAssets.topUpFleetsFromExportDemand();
    const cartAfter = ledger!.landAssets.find(asset => asset.assetId === "cart")!;
    const totalAfter = cartAfter.available + cartAfter.reserved + cartAfter.inTransit + cartAfter.maintenance;
    expect(totalAfter).toBeGreaterThanOrEqual(baseline);
    // Large export (40 units * 5 slots * 12 / 3 cycles annualized heavily) should grow the fleet.
    expect(totalAfter).toBeGreaterThan(baseline);
  });

  it("moves an arrived river barge to the destination market instead of returning it upstream", () => {
    MerchantTransportAssets.addAvailableRiverAssets(1, 1);
    const reservation = MerchantTransportAssets.reserve(1, 10, [RIVER_BARGE_ALLOCATION]);
    expect(reservation).not.toBeNull();
    MerchantTransportAssets.depart(reservation?.reservation.id ?? -1);

    MerchantTransportAssets.settleCaravan(
      { transportReservationId: reservation?.reservation.id, buyer: 2, buyerType: "burg" },
      "arrived"
    );

    expect(
      MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "river-barge")?.available ?? 0
    ).toBe(0);
    expect(MerchantTransportAssets.getAvailability(2).find(asset => asset.assetId === "river-barge")?.available).toBe(
      1
    );
  });

  it("reserves one concrete merchant hull at a time and releases it through Shipbuilding", () => {
    MerchantTransportAssets.reconcileMerchantHulls([
      { id: 20, shipClassId: "sloop", homeBurgId: 1, ownerId: 1, status: "voyage" }
    ]);

    const reservation = MerchantTransportAssets.reserve(1, 10, [SLOOP_ALLOCATION]);
    expect(reservation).not.toBeNull();
    expect(reservation?.reservation.allocations).toMatchObject([{ shipHullIds: [20], capacitySlots: 100 }]);
    expect(reservedHullIds).toEqual([20]);
    expect(MerchantTransportAssets.reserve(1, 11, [SLOOP_ALLOCATION])).toBeNull();

    MerchantTransportAssets.depart(reservation?.reservation.id ?? -1);
    expect(MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "hull-20")?.inTransit).toBe(1);

    MerchantTransportAssets.settleCaravan({ transportReservationId: reservation?.reservation.id }, "arrived");
    expect(releasedHullIds).toEqual([20]);
    expect(MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "hull-20")?.available).toBe(1);
  });
});
