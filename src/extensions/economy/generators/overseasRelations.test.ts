import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import {
  clearEconomyContext,
  getDistantRealms,
  getOverseasExpeditions,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import type { Good } from "./goodsGeneratorTypes";
import { MerchantTransportAssets } from "./merchantTransportAssets";
import { OverseasRelations } from "./overseasRelations";

function spicesGood(): Good {
  return {
    i: 1,
    name: "Spices",
    value: 18,
    tags: ["luxury"],
    unit: "chest",
    icon: "good-spices",
    color: "#e99c75"
  } as unknown as Good;
}

// Realm #1 from the seed table: Zantira Coast — tropical, nearAbroad, specialty includes Spices.
const REALM_ID = 1;
// Realm #7: Kai'lani Archipelago — also trades Spices, the only Good this fixture registers.
const OTHER_REALM_ID = 7;

describe("OverseasRelations", () => {
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
    simulationContext.extensions = {};
    simulationContext.currentDay = 1000;
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    worldContext.options = {} as never;
    worldContext.pack = {
      states: [{ i: 0 } as State, { i: 1, name: "Testland", treasury: 100 } as State],
      burgs: [{ i: 0 } as Burg, { i: 1, state: 1, market: 1, port: 5, capital: 1, cell: 0, removed: false } as Burg],
      cells: { g: Uint16Array.from([0]) }
    } as unknown as PackedGraph;
    worldContext.grid = { cells: { temp: Float32Array.from([12]) } } as never;
    setMarkets([{ i: 1, centerBurgId: 1, color: "#000", goods: {} }] as never);
    setGoods([spicesGood()]);
    reservedHullIds.length = 0;
    releasedHullIds.length = 0;
    document.addEventListener("fmg:shipbuilding-merchant-hull-reservation-request", reserveHullListener);
    document.addEventListener("fmg:shipbuilding-merchant-hull-release-request", releaseHullListener);
    OverseasRelations.generate();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.removeEventListener("fmg:shipbuilding-merchant-hull-reservation-request", reserveHullListener);
    document.removeEventListener("fmg:shipbuilding-merchant-hull-release-request", releaseHullListener);
    simulationContext.extensions = {};
    clearEconomyContext();
  });

  it("seeds the Distant Realm table once and never reseeds it", () => {
    const first = getDistantRealms();
    expect(first.length).toBeGreaterThan(0);
    OverseasRelations.generate();
    expect(getDistantRealms()).toBe(first);
  });

  it("refuses to fund an expedition the treasury cannot afford", () => {
    const state = worldContext.pack.states[1];
    state.treasury = 0;

    const result = OverseasRelations.sendTradeExpedition(1, REALM_ID);

    expect(result).toEqual({ ok: false, reason: "insufficient-treasury" });
    expect(getOverseasExpeditions()).toHaveLength(0);
  });

  it("refunds the treasury and reports no-ships-available when the merchant fleet is empty", () => {
    MerchantTransportAssets.reconcileMerchantHulls([]); // activates water-asset mode with zero hulls
    const state = worldContext.pack.states[1];
    const treasuryBefore = state.treasury;

    const result = OverseasRelations.sendTradeExpedition(1, REALM_ID);

    expect(result).toEqual({ ok: false, reason: "no-ships-available" });
    expect(state.treasury).toBe(treasuryBefore);
    expect(getOverseasExpeditions()).toHaveLength(0);
  });

  it("draws down the shared merchant hull pool — a second expedition finds no ship left", () => {
    MerchantTransportAssets.reconcileMerchantHulls([
      { id: 20, shipClassId: "caravel", homeBurgId: 1, ownerId: 1, status: "voyage" }
    ]);

    const first = OverseasRelations.sendTradeExpedition(1, REALM_ID);
    expect(first.ok).toBe(true);
    expect(reservedHullIds).toEqual([20]);

    const second = OverseasRelations.sendTradeExpedition(1, OTHER_REALM_ID);
    expect(second).toEqual({ ok: false, reason: "no-ships-available" });
  });

  it("resolves a successful voyage: treasury profit, relation upgraded to trading, hull returns to port", () => {
    MerchantTransportAssets.reconcileMerchantHulls([
      { id: 21, shipClassId: "caravel", homeBurgId: 1, ownerId: 1, status: "voyage" }
    ]);
    const state = worldContext.pack.states[1];
    const treasuryAfterDeparture = (() => {
      OverseasRelations.sendTradeExpedition(1, REALM_ID);
      return state.treasury;
    })();

    const expedition = getOverseasExpeditions()[0];
    simulationContext.currentDay = expedition.etaTick;
    vi.spyOn(Math, "random").mockReturnValue(0.999); // above any loss risk this table produces

    OverseasRelations.settleMonthly();

    expect(expedition.state).toBe("resolved");
    expect(expedition.outcome?.lost).toBe(false);
    expect(state.treasury).toBeGreaterThan(treasuryAfterDeparture);
    expect(releasedHullIds).toEqual([21]);
    expect(OverseasRelations.getOverseasRelationsOverview(1)[0].relation).toBe("trading");

    // The hull is back in port — a follow-up expedition can draw it again.
    const followUp = OverseasRelations.sendTradeExpedition(1, REALM_ID);
    expect(followUp.ok).toBe(true);
  });

  it("resolves a lost voyage: the buy cost is not refunded and no profit is credited", () => {
    MerchantTransportAssets.reconcileMerchantHulls([
      { id: 22, shipClassId: "caravel", homeBurgId: 1, ownerId: 1, status: "voyage" }
    ]);
    const state = worldContext.pack.states[1];
    OverseasRelations.sendTradeExpedition(1, REALM_ID);
    const expedition = getOverseasExpeditions()[0];
    const treasuryAfterDeparture = state.treasury;

    simulationContext.currentDay = expedition.etaTick;
    vi.spyOn(Math, "random").mockReturnValue(0); // guarantees the loss roll

    OverseasRelations.settleMonthly();

    expect(expedition.state).toBe("resolved");
    expect(expedition.outcome?.lost).toBe(true);
    expect(state.treasury).toBe(treasuryAfterDeparture); // no payout, and no refund of the sunk buyCost
  });
});
