import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import {
  clearEconomyContext,
  getDistantRealms,
  getOverseasExpeditions,
  getOverseasRelationLedgers,
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
  const reservedEscortHullIds: number[] = [];
  const releasedEscortHullIds: { hullIds: number[]; outcome: "arrived" | "lost" }[] = [];
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
  const escortAvailabilityListener = (event: Event) => {
    const detail = (event as CustomEvent<{ stateId: number; hullIds?: number[] }>).detail;
    if (detail.stateId === 1) detail.hullIds = [90, 91];
  };
  const reserveEscortListener = (event: Event) => {
    const detail = (event as CustomEvent<{ hullIds: number[]; result?: string }>).detail;
    reservedEscortHullIds.push(...detail.hullIds);
    detail.result = "fulfilled";
  };
  const releaseEscortListener = (event: Event) => {
    const detail = (event as CustomEvent<{ hullIds: number[]; outcome: "arrived" | "lost"; result?: string }>).detail;
    releasedEscortHullIds.push({ hullIds: [...detail.hullIds], outcome: detail.outcome });
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
    reservedEscortHullIds.length = 0;
    releasedEscortHullIds.length = 0;
    document.addEventListener("fmg:shipbuilding-merchant-hull-reservation-request", reserveHullListener);
    document.addEventListener("fmg:shipbuilding-merchant-hull-release-request", releaseHullListener);
    document.addEventListener("fmg:shipbuilding-state-hull-availability-request", escortAvailabilityListener);
    document.addEventListener("fmg:shipbuilding-state-hull-reservation-request", reserveEscortListener);
    document.addEventListener("fmg:shipbuilding-state-hull-release-request", releaseEscortListener);
    OverseasRelations.generate();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.removeEventListener("fmg:shipbuilding-merchant-hull-reservation-request", reserveHullListener);
    document.removeEventListener("fmg:shipbuilding-merchant-hull-release-request", releaseHullListener);
    document.removeEventListener("fmg:shipbuilding-state-hull-availability-request", escortAvailabilityListener);
    document.removeEventListener("fmg:shipbuilding-state-hull-reservation-request", reserveEscortListener);
    document.removeEventListener("fmg:shipbuilding-state-hull-release-request", releaseEscortListener);
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

  it("assigns requested state-navy escorts and releases them after a successful voyage", () => {
    MerchantTransportAssets.reconcileMerchantHulls([
      { id: 23, shipClassId: "caravel", homeBurgId: 1, ownerId: 1, status: "voyage" }
    ]);

    const result = OverseasRelations.sendTradeExpedition(1, REALM_ID, 2);
    expect(result.ok).toBe(true);
    const expedition = getOverseasExpeditions()[0];
    expect(expedition.escortHullIds).toEqual([90, 91]);
    expect(reservedEscortHullIds).toEqual([90, 91]);

    simulationContext.currentDay = expedition.etaTick;
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    OverseasRelations.settleMonthly();

    expect(releasedEscortHullIds).toEqual([{ hullIds: [90, 91], outcome: "arrived" }]);
  });

  it("refunds the outlay when requested escorts cannot be reserved", () => {
    MerchantTransportAssets.reconcileMerchantHulls([
      { id: 24, shipClassId: "caravel", homeBurgId: 1, ownerId: 1, status: "voyage" }
    ]);
    const unavailableListener = (event: Event) => {
      const detail = (event as CustomEvent<{ result?: string }>).detail;
      detail.result = "unavailable";
    };
    document.addEventListener("fmg:shipbuilding-state-hull-reservation-request", unavailableListener);
    const treasuryBefore = worldContext.pack.states[1].treasury;

    const result = OverseasRelations.sendTradeExpedition(1, REALM_ID, 1);

    document.removeEventListener("fmg:shipbuilding-state-hull-reservation-request", unavailableListener);
    expect(result).toEqual({ ok: false, reason: "no-escorts-available" });
    expect(worldContext.pack.states[1].treasury).toBe(treasuryBefore);
    expect(getOverseasExpeditions()).toHaveLength(0);
  });

  it("turns a successful escorted tribute demand into a tributary with monthly income", () => {
    MerchantTransportAssets.reconcileMerchantHulls([
      { id: 25, shipClassId: "caravel", homeBurgId: 1, ownerId: 1, status: "voyage" }
    ]);
    const result = OverseasRelations.sendTributeExpedition(1, REALM_ID, 1);
    expect(result.ok).toBe(true);
    const expedition = getOverseasExpeditions()[0];
    simulationContext.currentDay = expedition.etaTick;
    vi.spyOn(Math, "random").mockReturnValueOnce(0.999).mockReturnValueOnce(0);

    OverseasRelations.settleMonthly();

    expect(expedition.outcome).toMatchObject({ lost: false, revenue: expect.any(Number) });
    const ledger = getOverseasRelationLedgers().find(entry => entry.stateId === 1 && entry.realmId === REALM_ID);
    expect(ledger).toMatchObject({ relation: "tributary" });
    expect(ledger?.lastTributePaid).toBeGreaterThan(0);
  });

  it("allows raids only against weaker Realms and leaves the target hostile after success", () => {
    MerchantTransportAssets.reconcileMerchantHulls([
      { id: 26, shipClassId: "caravel", homeBurgId: 1, ownerId: 1, status: "voyage" }
    ]);
    expect(OverseasRelations.sendRaidExpedition(1, REALM_ID, 1)).toEqual({
      ok: false,
      reason: "power-tier-restricted"
    });

    const result = OverseasRelations.sendRaidExpedition(1, OTHER_REALM_ID, 1);
    expect(result.ok).toBe(true);
    const expedition = getOverseasExpeditions()[0];
    simulationContext.currentDay = expedition.etaTick;
    vi.spyOn(Math, "random").mockReturnValueOnce(0.999).mockReturnValueOnce(0);
    OverseasRelations.settleMonthly();

    expect(expedition.outcome).toMatchObject({ lost: false, revenue: expect.any(Number) });
    expect(
      OverseasRelations.getOverseasRelationsOverview(1).find(row => row.realmId === OTHER_REALM_ID)?.relation
    ).toBe("hostile");
  });

  it("requires at least one state-navy escort for an armed expedition", () => {
    expect(OverseasRelations.sendTributeExpedition(1, REALM_ID, 0)).toEqual({
      ok: false,
      reason: "escort-required"
    });
  });

  it("marks a Realm hostile and sends the convoy to maintenance when an armed expedition is repelled", () => {
    MerchantTransportAssets.reconcileMerchantHulls([
      { id: 27, shipClassId: "caravel", homeBurgId: 1, ownerId: 1, status: "voyage" }
    ]);
    OverseasRelations.sendTributeExpedition(1, REALM_ID, 1);
    const expedition = getOverseasExpeditions()[0];
    simulationContext.currentDay = expedition.etaTick;
    vi.spyOn(Math, "random").mockReturnValue(0.999);

    OverseasRelations.settleMonthly();

    expect(expedition.outcome).toEqual({ lost: true, cause: "repelled" });
    expect(OverseasRelations.getOverseasRelationsOverview(1)[0].relation).toBe("hostile");
    expect(releasedEscortHullIds).toEqual([{ hullIds: [90], outcome: "lost" }]);
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
    OverseasRelations.sendTradeExpedition(1, REALM_ID, 1);
    const expedition = getOverseasExpeditions()[0];
    const treasuryAfterDeparture = state.treasury;

    simulationContext.currentDay = expedition.etaTick;
    vi.spyOn(Math, "random").mockReturnValue(0); // guarantees the loss roll

    OverseasRelations.settleMonthly();

    expect(expedition.state).toBe("resolved");
    expect(expedition.outcome?.lost).toBe(true);
    expect(state.treasury).toBe(treasuryAfterDeparture); // no payout, and no refund of the sunk buyCost
    expect(releasedEscortHullIds).toEqual([{ hullIds: [90], outcome: "lost" }]);
  });
});
