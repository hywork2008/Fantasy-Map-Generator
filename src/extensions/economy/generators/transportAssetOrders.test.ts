import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setCraftDomainEmploymentRecords, setGoods } from "../economyContext";
import { MerchantTransportAssets } from "./merchantTransportAssets";
import { TransportAssetOrders } from "./transportAssetOrders";

describe("transport asset orders", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [{ i: 0 } as Burg, { i: 1, market: 1, population: 100 } as Burg],
      markets: [
        {
          i: 1,
          centerBurgId: 1,
          color: "#000",
          goods: {
            1: { stock: 20, price: 2 },
            2: { stock: 20, price: 3 },
            3: { stock: 20, price: 5 }
          },
          marketTreasury: { balance: 100, ruralGrainPayable: 0 }
        }
      ]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Wood", value: 2, tags: [] },
      { i: 2, name: "Leather", value: 3, tags: [] },
      { i: 3, name: "Harnesses", value: 5, tags: [] },
      { i: 4, name: "Ropes", value: 2, tags: [] },
      { i: 5, name: "Tar", value: 1, tags: [] }
    ]);
  });

  afterEach(() => {
    TransportAssetOrders.clear();
    MerchantTransportAssets.clear();
    clearEconomyContext();
  });

  it("reserves material and market treasury, then credits only the durable ledger on completion", () => {
    setCraftDomainEmploymentRecords([{ burgId: 1, domain: "woodworking", workers: 20 }]);
    const initialCarts =
      MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "cart")?.available ?? 0;
    const order = TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "cart", quantity: 1 });

    TransportAssetOrders.beginProductionCycle();
    const used = TransportAssetOrders.consumePlannedWork(1, 100);

    expect(order).toMatchObject({ status: "completed", completedQuantity: 1, fundedAmount: 11 });
    expect(used.total).toBe(4);
    expect(worldContext.pack.markets[0].goods[1].stock).toBe(17);
    expect(worldContext.pack.markets[0].goods[3].stock).toBe(19);
    expect(worldContext.pack.markets[0].marketTreasury?.balance).toBe(89);
    expect(MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "cart")?.available).toBe(
      initialCarts + 1
    );
  });

  it("returns reserved but unconsumed materials exactly once when cancelled", () => {
    setCraftDomainEmploymentRecords([{ burgId: 1, domain: "woodworking", workers: 4 }]);
    const order = TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "wagon", quantity: 1 });

    TransportAssetOrders.beginProductionCycle();
    TransportAssetOrders.consumePlannedWork(1, 100);
    expect(worldContext.pack.markets[0].goods[1].stock).toBe(14);
    expect(TransportAssetOrders.cancel(order?.id ?? -1)).toBe(true);
    expect(TransportAssetOrders.cancel(order?.id ?? -1)).toBe(false);
    expect(worldContext.pack.markets[0].goods[1].stock).toBe(20);
    expect(worldContext.pack.markets[0].goods[3].stock).toBe(20);
  });

  it("keeps an unfunded order waiting without consuming partial materials", () => {
    setCraftDomainEmploymentRecords([{ burgId: 1, domain: "woodworking", workers: 20 }]);
    worldContext.pack.markets[0].marketTreasury!.balance = 1;
    const order = TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "cart", quantity: 1 });

    TransportAssetOrders.beginProductionCycle();

    expect(order).toMatchObject({ status: "waitingMaterials", blockedReason: "insufficientTreasury" });
    expect(worldContext.pack.markets[0].goods[1].stock).toBe(20);
    expect(worldContext.pack.markets[0].goods[3].stock).toBe(20);
  });

  it("honors a player budget limit without reserving materials or treasury", () => {
    const order = TransportAssetOrders.createOrder({
      marketId: 1,
      blueprintId: "cart",
      quantity: 1,
      requestedBy: "player",
      budgetLimit: 10
    });

    TransportAssetOrders.beginProductionCycle();

    expect(order).toMatchObject({ status: "waitingMaterials", blockedReason: "budgetLimit" });
    expect(worldContext.pack.markets[0].goods[1].stock).toBe(20);
    expect(worldContext.pack.markets[0].goods[3].stock).toBe(20);
    expect(worldContext.pack.markets[0].marketTreasury?.balance).toBe(100);
  });

  it("funds player orders before automatic replacement orders", () => {
    worldContext.pack.markets[0].goods[1].stock = 3;
    worldContext.pack.markets[0].goods[3].stock = 1;
    const automaticOrder = TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "cart", quantity: 1 });
    const playerOrder = TransportAssetOrders.createOrder({
      marketId: 1,
      blueprintId: "cart",
      quantity: 1,
      requestedBy: "player",
      budgetLimit: 11
    });

    TransportAssetOrders.beginProductionCycle();

    expect(playerOrder).toMatchObject({ status: "building", fundedAmount: 11 });
    expect(automaticOrder).toMatchObject({ status: "waitingMaterials", blockedReason: "missingMaterials" });
  });

  it("credits a completed river barge to the durable ledger instead of market goods", () => {
    worldContext.pack.markets[0].goods[4] = { stock: 20, price: 2 };
    worldContext.pack.markets[0].goods[5] = { stock: 20, price: 1 };
    setCraftDomainEmploymentRecords([{ burgId: 1, domain: "woodworking", workers: 24 }]);
    const order = TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "river-barge", quantity: 1 });

    TransportAssetOrders.beginProductionCycle();
    TransportAssetOrders.consumePlannedWork(1, 100);

    expect(order).toMatchObject({ status: "completed", completedQuantity: 1 });
    expect(MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "river-barge")?.available).toBe(
      1
    );
  });
});
