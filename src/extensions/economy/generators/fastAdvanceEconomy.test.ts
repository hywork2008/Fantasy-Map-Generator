import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FAST_ADVANCE_PRESETS } from "../../../generators/fastAdvance/fastAdvancePresets";
import { createRNGService } from "../../../utils/probabilityUtils";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, getMarkets, initEconomyContext, setGoods, setMarkets } from "../economyContext";
import { applyFastForwardEconomySettlement } from "./fastAdvanceEconomy";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";

const NO_JITTER_RNG = createRNGService(() => 0.5); // rand()*2-1 === 0

describe("applyFastForwardEconomySettlement", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      states: [
        { i: 0 },
        { i: 1, name: "Volta", removed: false, capital: 1, treasury: 1000 },
        { i: 2, name: "Removed", removed: true, treasury: 500 }
      ],
      burgs: [
        { i: 0 },
        { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, treasury: 100 },
        { i: 2, state: 1, market: 1, x: 1, y: 1, removed: true, treasury: 999 }
      ],
      cells: { i: [0, 1] }
    } as unknown as PackedGraph;
    setGoods([{ i: 1, name: "Grain", tags: [], value: 2, unit: "sack", icon: "good-grain", color: "#c9a227" }]);
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: { 1: { stock: 100, price: 2 } } }]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("applies the annual price/stock/treasury rates with no jitter", () => {
    const rates = { ...FAST_ADVANCE_PRESETS.steady, variancePct: 0 };
    applyFastForwardEconomySettlement(24, rates, NO_JITTER_RNG); // 24 months == 2 years

    const priceFactor = (1 + rates.priceInflationPctPerYear / 100) ** 2;
    const stockFactor = (1 + rates.goodsStockGrowthPctPerYear / 100) ** 2;
    const treasuryFactor = (1 + rates.treasuryGrowthPctPerYear / 100) ** 2;

    const market = getMarkets()[0];
    expect(market?.goods[1]?.price).toBeCloseTo(2 * priceFactor, 2);
    expect(market?.goods[1]?.stock).toBeCloseTo(100 * stockFactor, 2);

    const state = worldContext.pack.states[1];
    expect(state.treasury).toBeCloseTo(1000 * treasuryFactor, 2);
    const burg = worldContext.pack.burgs[1];
    expect(burg.treasury).toBeCloseTo(100 * treasuryFactor, 2);
  });

  it("leaves removed states/burgs untouched", () => {
    const rates = { ...FAST_ADVANCE_PRESETS.steady, variancePct: 0 };
    applyFastForwardEconomySettlement(12, rates, NO_JITTER_RNG);
    expect(worldContext.pack.states[2].treasury).toBe(500);
    expect(worldContext.pack.burgs[2].treasury).toBe(999);
  });

  it("is a no-op for zero or negative monthsElapsed", () => {
    const rates = FAST_ADVANCE_PRESETS.steady;
    applyFastForwardEconomySettlement(0, rates, NO_JITTER_RNG);
    expect(getMarkets()[0]?.goods[1]?.stock).toBe(100);
    expect(worldContext.pack.states[1].treasury).toBe(1000);
  });

  it("never lets treasury go negative even under the Collapse preset over a long run", () => {
    const rates = { ...FAST_ADVANCE_PRESETS.collapse, variancePct: 0 };
    applyFastForwardEconomySettlement(12 * 200, rates, NO_JITTER_RNG); // 200 years
    expect(worldContext.pack.states[1].treasury).toBeGreaterThanOrEqual(0);
    expect(getMarkets()[0]?.goods[1]?.stock).toBeGreaterThanOrEqual(0);
  });

  it("clamps stock growth to stockCapMultiplier/stockFloorMultiplier of the batch's starting stock", () => {
    // An extreme rate over many years would otherwise blow far past a 5x cap in one call.
    const rates = { ...FAST_ADVANCE_PRESETS.boom, goodsStockGrowthPctPerYear: 500, variancePct: 0 };
    applyFastForwardEconomySettlement(12 * 50, rates, NO_JITTER_RNG); // 50 years
    expect(getMarkets()[0]?.goods[1]?.stock).toBeLessThanOrEqual(100 * rates.stockCapMultiplier + 1e-6);
  });

  it("is deterministic: the same rng stream applied from the same starting state matches", () => {
    const rates = FAST_ADVANCE_PRESETS.steady;
    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: { 1: { stock: 100, price: 2 } } }]);
    Markets.sync();
    const rngA = createRNGService(() => 0.9);
    applyFastForwardEconomySettlement(6, rates, rngA);
    const afterA = getMarkets()[0]?.goods[1]?.price;

    setMarkets([{ i: 1, centerBurgId: 1, color: "#111", goods: { 1: { stock: 100, price: 2 } } }]);
    Markets.sync();
    const rngB = createRNGService(() => 0.9);
    applyFastForwardEconomySettlement(6, rates, rngB);
    const afterB = getMarkets()[0]?.goods[1]?.price;

    expect(afterA).toBe(afterB);
  });
});
