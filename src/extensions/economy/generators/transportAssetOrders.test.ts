import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setCraftDomainEmploymentRecords,
  setGoods,
  setMarketCellColumn
} from "../economyContext";
import { setEconomyCalibrationState } from "../store/economyCalibrationState";
import { getHouseholdWealth } from "./burgMarketLedgers";
import { MerchantTransportAssets } from "./merchantTransportAssets";
import { TransportAssetOrders } from "./transportAssetOrders";

/** A wright's month at the craft wage, with no grain market (`getSubsistenceWage`): 1.5 × 0.43 / 12. */
const WAGE_PER_WORK_POINT = (1.5 * 0.43) / 12;
/** 1.5 wood × 2 + 0.2 harness × 5 + 0.8 head of horses × 3 + twelve months of a wright's wage. */
const CART_COST = 1.5 * 2 + 0.2 * 5 + 0.8 * 3 + 12 * WAGE_PER_WORK_POINT;

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
            3: { stock: 20, price: 5 },
            6: { stock: 20, price: 3 }
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
      { i: 5, name: "Tar", value: 1, tags: [] },
      { i: 6, name: "Horses", value: 3, tags: [] }
    ]);
    // These tests (outside the "applyCalibration real-people transport capacity" block below)
    // exercise the pre-PR-3 legacy capacity model (25% of observed craft employment, `used.total`
    // as a raw population-point sum) deliberately — PR 4 no longer runs it by default.
    setEconomyCalibrationState({ applyCalibration: false });
  });

  afterEach(() => {
    TransportAssetOrders.clear();
    MerchantTransportAssets.clear();
    clearEconomyContext();
  });

  it("reserves material and market treasury, then credits only the durable ledger on completion", () => {
    setCraftDomainEmploymentRecords([{ burgId: 1, domain: "woodworking", workers: 48 }]);
    const initialCarts =
      MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "cart")?.available ?? 0;
    const order = TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "cart", quantity: 1 });
    const wealthBefore = getHouseholdWealth(1);

    TransportAssetOrders.beginProductionCycle();
    const used = TransportAssetOrders.consumePlannedWork(1, 100);

    // The wrights' wages went to the town's households as they worked.
    expect(getHouseholdWealth(1) - wealthBefore).toBeCloseTo(12 * WAGE_PER_WORK_POINT, 1);

    expect(order).toMatchObject({ status: "completed", completedQuantity: 1, reservedWages: undefined });
    expect(order?.fundedAmount).toBeCloseTo(CART_COST, 1);
    expect(used.total).toBe(12);
    expect(worldContext.pack.markets[0].goods[1].stock).toBe(18.5);
    expect(worldContext.pack.markets[0].goods[3].stock).toBe(19.8);
    expect(worldContext.pack.markets[0].goods[6].stock).toBe(19.2);
    expect(worldContext.pack.markets[0].marketTreasury?.balance).toBeCloseTo(100 - CART_COST, 1);
    expect(MerchantTransportAssets.getAvailability(1).find(asset => asset.assetId === "cart")?.available).toBe(
      initialCarts + 1
    );
  });

  it("returns reserved but unconsumed materials exactly once when cancelled", () => {
    setCraftDomainEmploymentRecords([{ burgId: 1, domain: "woodworking", workers: 4 }]);
    const order = TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "wagon", quantity: 1 });

    TransportAssetOrders.beginProductionCycle();
    TransportAssetOrders.consumePlannedWork(1, 100);
    expect(worldContext.pack.markets[0].goods[1].stock).toBe(16);
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
      budgetLimit: 5
    });

    TransportAssetOrders.beginProductionCycle();

    expect(order).toMatchObject({ status: "waitingMaterials", blockedReason: "budgetLimit" });
    expect(worldContext.pack.markets[0].goods[1].stock).toBe(20);
    expect(worldContext.pack.markets[0].goods[3].stock).toBe(20);
    expect(worldContext.pack.markets[0].marketTreasury?.balance).toBe(100);
  });

  it("funds player orders before automatic replacement orders", () => {
    worldContext.pack.markets[0].goods[1].stock = 1.5;
    worldContext.pack.markets[0].goods[3].stock = 0.2;
    const automaticOrder = TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "cart", quantity: 1 });
    const playerOrder = TransportAssetOrders.createOrder({
      marketId: 1,
      blueprintId: "cart",
      quantity: 1,
      requestedBy: "player",
      budgetLimit: 19
    });

    TransportAssetOrders.beginProductionCycle();

    expect(playerOrder).toMatchObject({ status: "building" });
    expect(playerOrder?.fundedAmount).toBeCloseTo(CART_COST, 1);
    expect(automaticOrder).toMatchObject({ status: "waitingMaterials", blockedReason: "missingMaterials" });
  });

  it("builds what the materials in hand allow, with a plain leather harness when no fitted one is to be had", () => {
    worldContext.pack.markets[0].goods[1].stock = 3;
    worldContext.pack.markets[0].goods[3].stock = 0;
    const order = TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "cart", quantity: 5 });

    TransportAssetOrders.beginProductionCycle();

    // Three wood make two carts; the other three wait for the next cycle in an order of their own.
    expect(order).toMatchObject({ status: "building", quantity: 2, reservedMaterials: { 1: 3, 2: 0.4 } });
    expect(TransportAssetOrders.getOrders(1).find(other => other !== order)).toMatchObject({
      status: "queued",
      quantity: 3
    });
  });

  it("fits the harnesses in hand first and orders the missing ones from the smiths", () => {
    worldContext.pack.markets[0].goods[1].stock = 7.5;
    worldContext.pack.markets[0].goods[3].stock = 0.4;
    const order = TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "cart", quantity: 5 });

    TransportAssetOrders.beginProductionCycle();

    // Two carts get fitted harnesses; the other three are built with leather in the same cycle.
    expect(order).toMatchObject({ status: "building", quantity: 2, reservedMaterials: { 1: 3, 3: 0.4 } });
    const plain = TransportAssetOrders.getOrders(1).find(other => other !== order);
    expect(plain).toMatchObject({ status: "building", quantity: 3, reservedMaterials: { 1: 4.5 } });
    expect(plain?.reservedMaterials[2]).toBeCloseTo(0.6);
    expect(TransportAssetOrders.getMaterialDemandByGood(1).get(3)).toBeCloseTo(0.6);
  });

  it("sells a delivering market's spare carts to a market waiting on its own", () => {
    worldContext.pack.burgs.push({ i: 2, market: 2, population: 10 } as Burg);
    worldContext.pack.markets.push({
      i: 2,
      centerBurgId: 2,
      color: "#111",
      goods: { 1: { stock: 0, price: 2 }, 3: { stock: 0, price: 5 }, 6: { stock: 0, price: 3 } },
      marketTreasury: { balance: 100, ruralGrainPayable: 0 }
    } as unknown as PackedGraph["markets"][number]);
    MerchantTransportAssets.addAvailableLandAssets(1, "cart", 3);
    const cartsAt = (marketId: number) =>
      MerchantTransportAssets.getAvailability(marketId).find(asset => asset.assetId === "cart")?.available;
    const before = cartsAt(2) ?? 0;
    const order = TransportAssetOrders.createOrder({ marketId: 2, blueprintId: "cart", quantity: 2 });

    TransportAssetOrders.sellArrivedVehicles({
      transportDispatcherMarketId: 1,
      transportAllocations: [
        { mode: "land", transportId: "cart", transportName: "Cart", unitCount: 2, capacitySlots: 160, usedSlots: 0 }
      ],
      buyer: 2,
      buyerType: "market"
    });

    // Two carts with their horses, at what they would cost to build at the buyer's prices.
    expect(cartsAt(1)).toBe(2);
    expect(cartsAt(2)).toBe(before + 2);
    expect(order).toMatchObject({ status: "cancelled", quantity: 0 });
    expect(worldContext.pack.markets[1].marketTreasury?.balance).toBeCloseTo(100 - 2 * CART_COST, 1);
    expect(worldContext.pack.markets[0].marketTreasury?.balance).toBeCloseTo(100 + 2 * CART_COST, 1);
  });

  it("orders its own carts only for hire that ran three cycles, and withdraws them when carts stand idle", () => {
    worldContext.pack.markets[0].goods[1].stock = 0;
    const cart = () => MerchantTransportAssets.ensureLedger(1)!.landAssets.find(asset => asset.assetId === "cart")!;
    const cartOrders = () =>
      TransportAssetOrders.getOrders(1).filter(order => order.blueprintId === "cart" && order.status !== "cancelled");
    const hireForCycle = (vehicles: number) => {
      cart().hiredDays = vehicles * 30;
      cart().idleLowWater = 0;
    };

    hireForCycle(3);
    TransportAssetOrders.beginProductionCycle();
    hireForCycle(4);
    TransportAssetOrders.beginProductionCycle();
    expect(cartOrders()).toHaveLength(0);

    hireForCycle(2);
    TransportAssetOrders.beginProductionCycle();
    expect(cartOrders()).toMatchObject([{ quantity: 2, status: "waitingMaterials" }]);

    // A slack cycle: the market's own cart stood free every day and nothing was hired.
    cart().idleLowWater = 1;
    TransportAssetOrders.beginProductionCycle();
    expect(cartOrders()).toMatchObject([{ quantity: 1 }]);
  });

  it("lets the shipping house pay for a craft when the market's purse is short", () => {
    worldContext.pack.markets[0].marketTreasury = { balance: 4, ruralGrainPayable: 0, tradeWorkingCapital: 50 };
    const order = TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "cart", quantity: 1 });

    TransportAssetOrders.beginProductionCycle();

    expect(order?.fundedAmount).toBeCloseTo(CART_COST, 1);
    expect(worldContext.pack.markets[0].marketTreasury?.balance).toBe(0);
    expect(worldContext.pack.markets[0].marketTreasury?.tradeWorkingCapital).toBeCloseTo(50 - (CART_COST - 4), 1);
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

  describe("applyCalibration real-people transport capacity (docs/plan/craft-demand-calibration.md Key Decision 10, PR 3)", () => {
    afterEach(() => setEconomyCalibrationState({ applyCalibration: false }));

    it("completes a cart convoy within one production cycle for the 9000-person reference fixture, with no guild-craft employment at all", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      worldContext.populationRate = 1000;
      (worldContext.pack.burgs[1] as Burg).population = 9; // 9 points × 1000 = 9000 people
      // The legacy "25% of observed woodworking employment" capacity would give this burg zero
      // transport-labor capacity with no craft-domain records at all — the dedicated real-people
      // pool (TRANSPORT_CRAFT_PEOPLE_PER_THOUSAND) must not depend on this being non-empty.
      setCraftDomainEmploymentRecords([]);

      TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "cart", quantity: 1 });
      TransportAssetOrders.beginProductionCycle();
      const used = TransportAssetOrders.consumePlannedWork(1, 9);

      const order = TransportAssetOrders.getOrders(1)[0];
      expect(order).toMatchObject({ status: "completed", completedQuantity: 1 });
      // 12 real people converted back to population points (12/1000), not a chunk of the burg's
      // whole 9-point production-labor budget.
      expect(used.total).toBeCloseTo(0.012, 6);
    });

    it("gives the village wrights what the town's cannot take, outside the burg's labour", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      worldContext.populationRate = 1000;
      (worldContext.pack.burgs[1] as Burg).population = 1; // 1,000 people: 1.5 town wrights
      // 100,000 country people: 30 village wrights.
      worldContext.pack.cells = { i: [0, 1], h: [30, 30], pop: [50, 50] } as unknown as PackedGraph["cells"];
      setMarketCellColumn(Uint16Array.from([1, 1]));
      setCraftDomainEmploymentRecords([]);

      const order = TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "wagon", quantity: 1 });
      TransportAssetOrders.beginProductionCycle();
      expect(order).toMatchObject({ status: "building", workPoints: 30 });

      const used = TransportAssetOrders.consumePlannedWork(1, 1);
      expect(order?.workPoints).toBe(31.5);
      expect(used.total).toBeCloseTo(0.0015, 6);
    });

    it("reports the transport-labor allocation for Employment Overview, but production-generator.ts must not feed it into guild-craft employment", () => {
      setEconomyCalibrationState({ applyCalibration: true });
      worldContext.populationRate = 1000;
      (worldContext.pack.burgs[1] as Burg).population = 9;
      setCraftDomainEmploymentRecords([]);

      TransportAssetOrders.createOrder({ marketId: 1, blueprintId: "cart", quantity: 1 });
      TransportAssetOrders.beginProductionCycle();
      const used = TransportAssetOrders.consumePlannedWork(1, 9);

      // See production-generator.ts's runWorkerLoop(): under applyCalibration it skips folding
      // reservedTransportWork.byDomain into CraftDomainEmploymentRecord (Key Decision 10).
      expect(used.byDomain.get("woodworking")).toBeGreaterThan(0);
    });
  });
});
