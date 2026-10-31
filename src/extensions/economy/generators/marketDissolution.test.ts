import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMarkets,
  initEconomyContext,
  setCaravans,
  setMarketShipments,
  setMarkets,
  setSaltShipments,
  setTransportReservations
} from "../economyContext";
import {
  absorbMarketHoldings,
  handOverLocalDeliveries,
  handOverTrade,
  hasMarketTrafficInFlight,
  updateLowRuralWealthMonths
} from "./marketDissolution";
import type { Caravan, Market, TransportReservation } from "./marketTypes";
import { isMarketTradePermitted } from "./merchantOrganizations";
import type { MarketShipment } from "./retailInventoryTypes";
import type { SaltShipment } from "./saltLogisticsTypes";

const market = (i: number, wallet: number, extra: Partial<Market> = {}): Market =>
  ({
    i,
    centerBurgId: i,
    color: "",
    goods: {},
    foodLedger: { ruralHouseholdWealth: wallet },
    ...extra
  }) as unknown as Market;

describe("marketDissolution (docs/plan/market-founding-viability.md §3.2)", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [{ i: 0 }, { i: 1, capital: 1 }, { i: 2 }, { i: 3 }, { i: 4 }] as unknown as Burg[],
      cells: { i: [], h: [], pop: [] }
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("counts months below the median share, resets above it, and never returns a capital's market", () => {
    // Per head: 1 (capital), 0.1, 1, 1.
    setMarkets([market(1, 100), market(2, 10), market(3, 100), market(4, 100)]);
    const people = new Map([
      [1, 100],
      [2, 100],
      [3, 100],
      [4, 100]
    ]);
    expect(updateLowRuralWealthMonths(people, 0.2, 2)).toEqual([]);
    expect(getMarkets()[1].lowRuralWealthMonths).toBe(1);
    expect(updateLowRuralWealthMonths(people, 0.2, 2).map(m => m.i)).toEqual([2]);

    getMarkets()[1].foodLedger!.ruralHouseholdWealth = 50;
    updateLowRuralWealthMonths(people, 0.2, 2);
    expect(getMarkets()[1].lowRuralWealthMonths).toBeUndefined();

    getMarkets()[0].foodLedger!.ruralHouseholdWealth = 1;
    updateLowRuralWealthMonths(people, 0.2, 1);
    expect(getMarkets()[0].lowRuralWealthMonths).toBe(1);
    expect(updateLowRuralWealthMonths(people, 0.2, 1).map(m => m.i)).not.toContain(1);
  });

  it("moves money, debts, goods and the purse without creating or destroying any", () => {
    const from = market(2, 40, {
      goods: { 0: { stock: 10, price: 1, costBasis: 2 }, 1: { stock: 3, price: 5 } },
      marketTreasury: {
        balance: 7,
        ruralGrainPayable: 4,
        saltPayables: { 9: 6 },
        ruralSaltReceivable: 2,
        tradePayables: { 1: 3, 3: 5 }
      }
    });
    const into = market(1, 60, {
      goods: { 0: { stock: 30, price: 2, costBasis: 1 } },
      marketTreasury: { balance: 10, ruralGrainPayable: 1, saltPayables: { 9: 1 }, tradePayables: { 2: 8 } }
    });
    const other = market(3, 0, { marketTreasury: { balance: 0, ruralGrainPayable: 0, tradePayables: { 2: 4 } } });
    setMarkets([into, from, other]);

    absorbMarketHoldings(from, into);

    expect(into.marketTreasury).toMatchObject({
      balance: 17,
      ruralGrainPayable: 5,
      saltPayables: { 9: 7 },
      ruralSaltReceivable: 2,
      // Owed between the two markets is owed to itself; the debt to market 3 stays.
      tradePayables: { 3: 5 }
    });
    expect(other.marketTreasury!.tradePayables).toEqual({ 1: 4 });
    expect(into.goods[0]).toEqual({ stock: 40, price: 2, costBasis: 1.25 });
    expect(into.goods[1]).toEqual({ stock: 3, price: 5 });
    expect(into.foodLedger!.ruralHouseholdWealth).toBe(100);
    expect(from.foodLedger!.ruralHouseholdWealth).toBe(0);
  });

  it("waits for trade with other markets, not for the market's own salt deliveries", () => {
    const target = market(2, 0);
    setMarkets([market(1, 0), target]);
    setSaltShipments([{ fromMarketId: 1, toMarketId: 2, status: "inTransit" } as unknown as SaltShipment]);
    expect(hasMarketTrafficInFlight(target)).toBe(false);
    setCaravans([{ seller: 1, sellerType: "market", buyer: 2, buyerType: "market", state: "transit" } as Caravan]);
    expect(hasMarketTrafficInFlight(target)).toBe(true);
    setCaravans([]);
    setTransportReservations([{ dispatcherMarketId: 2, state: "released" } as TransportReservation]);
    expect(hasMarketTrafficInFlight(target)).toBe(false);
    setTransportReservations([{ dispatcherMarketId: 2, state: "inTransit" } as TransportReservation]);
    expect(hasMarketTrafficInFlight(target)).toBe(true);
  });

  it("a market winding down takes no new trade", () => {
    const winding = market(2, 0, { dissolving: true });
    expect(isMarketTradePermitted(market(1, 0), winding, 1)).toBe(false);
    expect(isMarketTradePermitted(winding, market(1, 0), 1)).toBe(false);
  });

  it("hands its own deliveries over always, and trade on the way only when asked", () => {
    const from = market(2, 0);
    const into = market(1, 0);
    setMarkets([into, from]);
    const salt = { fromMarketId: 3, toMarketId: 2, status: "inTransit" } as unknown as SaltShipment;
    const retail = { marketId: 2 } as unknown as MarketShipment;
    const caravan = { seller: 3, sellerType: "market", buyer: 2, buyerType: "market", state: "transit" } as Caravan;
    setSaltShipments([salt]);
    setMarketShipments([retail]);
    setCaravans([caravan]);

    handOverLocalDeliveries(from, into);
    expect([salt.toMarketId, retail.marketId, caravan.buyer]).toEqual([1, 1, 2]);
    handOverTrade(from, into);
    expect(caravan.buyer).toBe(1);
  });
});
