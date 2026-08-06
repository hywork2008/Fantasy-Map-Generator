import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import {
  clearEconomyContext,
  getOrCreateViticultureAllocationShares,
  initEconomyContext,
  setGoods
} from "../economyContext";
import { Goods } from "./goods-generator";
import type { Market } from "./marketTypes";
import {
  advanceViticultureAllocationShares,
  clearViticultureAllocationShares,
  getViticultureAllocationMultiplier
} from "./viticultureAllocation";

// durability 5 vs 4 (Phase 5, §9.4) — the whole point of this module is that these two differ.
const WINE_GOOD = {
  i: 1,
  name: "Wine",
  value: 6,
  tags: ["food", "luxury"],
  unit: "barrel",
  icon: "icon",
  color: "#fff",
  chance: 0,
  trade: { durability: 5 }
};

const RAISINS_GOOD = {
  i: 2,
  name: "Raisins",
  value: 5,
  tags: ["food", "preservative"],
  unit: "bag",
  icon: "icon",
  color: "#fff",
  chance: 0,
  trade: { durability: 4 }
};

function emptyMarket(): Market {
  return { i: 1, centerBurgId: 1, color: "#fff", goods: {} };
}

describe("viticultureAllocation", () => {
  beforeEach(() => {
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
    setGoods([WINE_GOOD, RAISINS_GOOD] as never);
    Goods.sync(); // Markets.quoteMarket() resolves goods via Goods.get(), which reads this cache.
  });

  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  describe("advanceViticultureAllocationShares", () => {
    it("starts each good's share at its instantaneous target on first sighting (no artificial ramp-up)", () => {
      advanceViticultureAllocationShares(10, emptyMarket());

      const table = getOrCreateViticultureAllocationShares()!;
      // Both start at stock 0, so weight = sellPrice = value * 0.9 (customerSellPrice's margin, which
      // cancels in the ratio): Wine 6*0.9=5.4, Raisins 5*0.9=4.5 -> target = 5.4/9.9, 4.5/9.9.
      expect(table["10:Wine"]).toBeCloseTo(5.4 / 9.9, 5);
      expect(table["10:Raisins"]).toBeCloseTo(4.5 / 9.9, 5);
    });

    it("moves each share toward a changed target at a rate inversely proportional to durability", () => {
      const market = emptyMarket();
      advanceViticultureAllocationShares(10, market); // establishes target1 as the baseline share

      // Flood Wine's stock so its scarcity-driven weight collapses (floored at 0.01), flipping the
      // target hard toward Raisins.
      market.goods[WINE_GOOD.i] = { stock: 1000, price: WINE_GOOD.value };
      advanceViticultureAllocationShares(10, market);

      const table = getOrCreateViticultureAllocationShares()!;
      const target1Wine = 5.4 / 9.9;
      const target2Wine = 0.01 / 4.51; // weight floored at 0.01 once scarcity collapses
      const target1Raisins = 4.5 / 9.9;
      const target2Raisins = 4.5 / 4.51;

      // Wine: durability 5 -> rate 0.5/5 = 0.1. Raisins: durability 4 -> rate 0.5/4 = 0.125.
      expect(table["10:Wine"]).toBeCloseTo(target1Wine + (target2Wine - target1Wine) * 0.1, 5);
      expect(table["10:Raisins"]).toBeCloseTo(target1Raisins + (target2Raisins - target1Raisins) * 0.125, 5);

      // Neither share jumped all the way to its new (very different) target — both are still
      // partway between the old and new target, confirming this is smoothing, not a hard reset.
      expect(table["10:Wine"]).toBeGreaterThan(target2Wine);
      expect(table["10:Wine"]).toBeLessThan(target1Wine);

      // The lower-durability good (Raisins) should have covered a larger fraction of the same-
      // shaped gap toward its target than the higher-durability good (Wine) did toward its own —
      // this is the "durability-proportional reallocation speed" the module exists to provide.
      const wineProgressFraction = (target1Wine - table["10:Wine"]) / (target1Wine - target2Wine);
      const raisinsProgressFraction = (table["10:Raisins"] - target1Raisins) / (target2Raisins - target1Raisins);
      expect(raisinsProgressFraction).toBeGreaterThan(wineProgressFraction);
    });

    it("keeps different burgs' shares independent", () => {
      const marketA = emptyMarket();
      const marketB: Market = {
        i: 2,
        centerBurgId: 2,
        color: "#fff",
        goods: { [WINE_GOOD.i]: { stock: 500, price: 6 } }
      };

      advanceViticultureAllocationShares(1, marketA);
      advanceViticultureAllocationShares(2, marketB);

      const table = getOrCreateViticultureAllocationShares()!;
      expect(table["1:Wine"]).not.toBeCloseTo(table["2:Wine"], 3);
    });

    it("no-ops when neither tracked good is present in the catalogue", () => {
      setGoods([] as never);
      advanceViticultureAllocationShares(10, emptyMarket());
      const table = getOrCreateViticultureAllocationShares()!;
      expect(Object.keys(table)).toHaveLength(0);
    });
  });

  describe("getViticultureAllocationMultiplier", () => {
    it("is 1 (no-op) for goods outside the tracked set, regardless of table contents", () => {
      advanceViticultureAllocationShares(10, emptyMarket());
      expect(getViticultureAllocationMultiplier({ name: "Cattle" }, 10)).toBe(1);
      expect(getViticultureAllocationMultiplier({ name: "Grapes" }, 10)).toBe(1);
    });

    it("is 1 when no share has been recorded yet for this (burg, good) pair", () => {
      expect(getViticultureAllocationMultiplier({ name: "Wine" }, 999)).toBe(1);
    });

    it("scales linearly around 1.0 as the smoothed share moves away from 0.5", () => {
      const table = getOrCreateViticultureAllocationShares()!;
      table["10:Wine"] = 0.6;
      table["10:Raisins"] = 0.3;

      // BIAS_STRENGTH = 0.6 -> multiplier = 1 + (share - 0.5) * 2 * 0.6.
      expect(getViticultureAllocationMultiplier({ name: "Wine" }, 10)).toBeCloseTo(1 + 0.1 * 1.2, 5);
      expect(getViticultureAllocationMultiplier({ name: "Raisins" }, 10)).toBeCloseTo(1 + -0.2 * 1.2, 5);
    });
  });

  describe("clearViticultureAllocationShares", () => {
    it("empties the tracked table", () => {
      advanceViticultureAllocationShares(10, emptyMarket());
      expect(Object.keys(getOrCreateViticultureAllocationShares()!)).not.toHaveLength(0);

      clearViticultureAllocationShares();
      expect(Object.keys(getOrCreateViticultureAllocationShares()!)).toHaveLength(0);
    });
  });
});
