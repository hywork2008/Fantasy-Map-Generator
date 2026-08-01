import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
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
