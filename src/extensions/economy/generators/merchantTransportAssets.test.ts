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

describe("merchant transport assets", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [{ i: 0 } as Burg, { i: 1, market: 1, population: 100 } as Burg],
      markets: [{ i: 1, centerBurgId: 1, color: "#000", goods: {} }]
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    MerchantTransportAssets.clear();
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
});
