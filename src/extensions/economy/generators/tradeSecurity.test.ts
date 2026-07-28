import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import {
  clearEconomyContext,
  getCaravans,
  getTradeSecurityLedgers,
  initEconomyContext,
  setBurgMarketLedgers,
  setCaravans,
  setMarkets
} from "../economyContext";
import { Caravans } from "./caravans";
import type { Caravan } from "./marketTypes";
import { TradeSecurity } from "./tradeSecurity";

function transitCaravan(): Caravan {
  return {
    i: 1,
    seller: 1,
    sellerType: "market",
    buyer: 1,
    buyerType: "market",
    payload: [],
    units: 1,
    value: 1,
    draftAnimalId: "horse",
    routeSegments: [],
    totalDistance: 10,
    currentDistance: 0,
    state: "transit"
  };
}

describe("TradeSecurityModule", () => {
  beforeEach(() => {
    simulationContext.extensions = {};
    simulationContext.frontier.cellStages = new Uint8Array([0]);
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    worldContext.distanceScale = 1;
    worldContext.pack = {
      states: [{ i: 0 } as State, { i: 1, name: "Border State", treasury: 10 } as State],
      burgs: [{ i: 0 } as Burg, { i: 1, state: 1, cell: 0, x: 0, y: 0 } as Burg],
      cells: {
        i: [0],
        state: Uint16Array.from([0]),
        danger: Uint8Array.from([255])
      }
    } as unknown as PackedGraph;
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: {} }]);
    setBurgMarketLedgers([{ burgId: 1, marketId: 1, merchants: [], warIntensity: 1 }]);
    setCaravans([]);
    TradeSecurity.generate();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    simulationContext.extensions = {};
    clearEconomyContext();
  });

  it("pro-rates security protection to the treasury payment actually made", () => {
    const state = worldContext.pack.states[1];
    const ledger = getTradeSecurityLedgers()[0];
    state.treasury = 0.1;
    ledger.investmentLevel = 1;

    TradeSecurity.settleMonthly();

    expect(state.treasury).toBe(0);
    expect(ledger.monthlyUpkeepPaid).toBe(0.1);
    expect(TradeSecurity.getEffectiveInvestment(1)).toBeCloseTo(0.4, 5);
  });

  it("applies destination frontier and danger risk to every caravan, then lets funded security prevent the roll", () => {
    expect(TradeSecurity.getBanditRiskPerDay(1, 1)).toBeCloseTo(0.01, 5);
    setCaravans([transitCaravan()]);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const firstTick = Caravans.tick(1);

    expect(firstTick.lost).toHaveLength(1);
    expect(getTradeSecurityLedgers()[0].lastCaravansLost).toBe(1);

    const ledger = getTradeSecurityLedgers()[0];
    ledger.investmentLevel = 1;
    TradeSecurity.settleMonthly();
    setCaravans([transitCaravan()]);

    const securedTick = Caravans.tick(1);

    expect(securedTick.lost).toEqual([]);
    expect(getCaravans()).toHaveLength(1);
    expect(TradeSecurity.getBanditRiskPerDay(1, 1)).toBe(0);
  });
});
