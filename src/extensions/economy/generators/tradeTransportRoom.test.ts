import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { ExportStaging } from "./exportStaging";
import type { Good } from "./goods-generator";
import type { TradeRouteSegment } from "./marketTypes";
import { LAND_HIRE_SHARE, MerchantTransportAssets } from "./merchantTransportAssets";
import {
  buildTransportRoom,
  ownLandRoomSlots,
  seaRoomSlots,
  takeTransportRoom,
  transportRoomSlots
} from "./tradeTransportRoom";

const LAND: TradeRouteSegment[] = [
  {
    type: "land",
    points: [
      [0, 0],
      [100, 0]
    ]
  }
];
const LAND_AND_SEA: TradeRouteSegment[] = [
  ...LAND,
  {
    type: "sea",
    points: [
      [100, 0],
      [300, 0]
    ]
  }
];

describe("trade transport room", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      goods: [
        { i: 1, name: "Grain", value: 1, tags: [], unit: "sack", cargo: { cargoSlotsPerUnit: 1 } } as unknown as Good
      ],
      markets: [
        { i: 1, centerBurgId: 1, color: "#000", goods: { 1: { stock: 1000, price: 1 } } },
        { i: 2, centerBurgId: 2, color: "#111", goods: {} }
      ],
      burgs: [{ i: 0 } as Burg, { i: 1, market: 1 } as Burg, { i: 2, market: 2 } as Burg],
      caravans: [],
      merchantTransportLedgers: [
        {
          marketId: 1,
          landAssets: [{ assetId: "cart", available: 2, reserved: 0, inTransit: 0, maintenance: 0, recoveryDays: 0 }],
          riverAssets: [],
          waterAssets: [],
          lastReconciledTick: 0
        }
      ],
      transportReservations: []
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    ExportStaging.clear();
    MerchantTransportAssets.setWaterAssetModeActive(false);
    clearEconomyContext();
  });

  const build = () =>
    buildTransportRoom(
      [1, 2],
      () => LAND,
      () => 10
    );

  it("books no more than the fleet carries in a month, less cargo already waiting", () => {
    const fleet = MerchantTransportAssets.getFleetCapacitySlots(1, "land", "horse");
    expect(fleet).toBeGreaterThan(0);
    // Two carts on a 10-day trip make three trips each in a month; as many again may be hired.
    expect(transportRoomSlots(build(), 1, LAND, 10)).toBeCloseTo(fleet * 3 * (1 + LAND_HIRE_SHARE));
    expect(ownLandRoomSlots(build(), 1, LAND, 10)).toBeCloseTo(fleet * 3);

    ExportStaging.bookFromRetail({
      marketId: 1,
      destinationMarketId: 2,
      goodId: 1,
      units: fleet,
      unitCost: 1,
      durationDays: 10,
      requireCapital: false
    });
    const room = build();
    expect(ownLandRoomSlots(room, 1, LAND, 10)).toBeCloseTo(fleet * 2);
    expect(transportRoomSlots(room, 1, LAND, 10)).toBeCloseTo(fleet * (3 * (1 + LAND_HIRE_SHARE) - 1));
    takeTransportRoom(room, 1, LAND, 10, fleet * (3 * (1 + LAND_HIRE_SHARE) - 1));
    expect(transportRoomSlots(room, 1, LAND, 10)).toBeCloseTo(0);
  });

  it("books one full trip per vehicle on a trip longer than a month", () => {
    const fleet = MerchantTransportAssets.getFleetCapacitySlots(1, "land", "horse");
    // A 90-day trip: each cart (own or hired) carries one load, not a third of one.
    expect(transportRoomSlots(build(), 1, LAND, 90)).toBeCloseTo(fleet * (1 + LAND_HIRE_SHARE));
    expect(ownLandRoomSlots(build(), 1, LAND, 90)).toBeCloseTo(fleet);
    const room = build();
    takeTransportRoom(room, 1, LAND, 90, fleet);
    expect(transportRoomSlots(room, 1, LAND, 90)).toBeCloseTo(fleet * LAND_HIRE_SHARE);
    // The 90-day cargo still fills most of the month's work on a short route.
    expect(transportRoomSlots(room, 1, LAND, 10)).toBeCloseTo(0);
  });

  it("holds sea trade of a market with no hull while Shipbuilding runs a finite fleet", () => {
    expect(seaRoomSlots(build(), 1, LAND_AND_SEA, 10)).toBe(Number.POSITIVE_INFINITY);
    MerchantTransportAssets.setWaterAssetModeActive(true);
    const room = build();
    expect(seaRoomSlots(room, 1, LAND_AND_SEA, 10)).toBe(0);
    expect(transportRoomSlots(room, 1, LAND_AND_SEA, 10)).toBe(0);
    expect(transportRoomSlots(room, 1, LAND, 10)).toBeGreaterThan(0);
  });

  it("counts another market's free hull lying in the exporter's port", () => {
    MerchantTransportAssets.setWaterAssetModeActive(true);
    MerchantTransportAssets.reconcileMerchantHulls([
      { id: 7, shipClassId: "sloop", homeBurgId: 2, ownerId: 2, status: "docked", currentBurgId: 1 }
    ]);
    expect(seaRoomSlots(build(), 1, LAND_AND_SEA, 10)).toBeCloseTo(100 * 3);
  });
});
