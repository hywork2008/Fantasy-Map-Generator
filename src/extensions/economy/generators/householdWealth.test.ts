import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMarketCellColumn, setMarkets } from "../economyContext";
import { creditHouseholdWealth, getHouseholdWealth } from "./burgMarketLedgers";
import {
  creditRuralHouseholdWealth,
  debitRuralHouseholdWealth,
  drawStateRuralHouseholdWealth,
  drawStateUrbanHouseholdWealth,
  getRuralHouseholdWealth,
  resetRuralHouseholdWealthCycleTracking,
  stateHasBurgs,
  stateOwnsRuralLand
} from "./householdWealth";
import type { Market } from "./marketTypes";

describe("householdWealth (docs/plan/economy-coupling-audit.md L2 Phase 2/3)", () => {
  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    worldContext.pack = {
      states: [{ i: 0 } as unknown as State, { i: 1 } as unknown as State, { i: 2 } as unknown as State],
      burgs: [{ i: 0 } as unknown as Burg],
      cells: { i: [], h: [], pop: [], state: [] }
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearEconomyContext();
  });

  describe("urban leg (Burg wallets)", () => {
    it("reports no wallet infrastructure for a state with no Burgs", () => {
      expect(stateHasBurgs(1)).toBe(false);
      expect(drawStateUrbanHouseholdWealth(1, 100)).toBe(0);
    });

    it("draws proportionally across every Burg wallet the state owns, never past what exists", () => {
      worldContext.pack.burgs = [
        { i: 0 } as unknown as Burg,
        { i: 1, state: 1, population: 0 } as unknown as Burg,
        { i: 2, state: 1, population: 0 } as unknown as Burg,
        { i: 3, state: 2, population: 0 } as unknown as Burg
      ];
      creditHouseholdWealth(1, 30);
      creditHouseholdWealth(2, 10);
      creditHouseholdWealth(3, 1000); // a different state's Burg — must stay untouched.

      expect(stateHasBurgs(1)).toBe(true);
      const collected = drawStateUrbanHouseholdWealth(1, 20);
      expect(collected).toBeCloseTo(20, 6);
      // 30/(30+10) and 10/40 pro-rata shares of the 20 collected.
      expect(getHouseholdWealth(1)).toBeCloseTo(15, 6);
      expect(getHouseholdWealth(2)).toBeCloseTo(5, 6);
      expect(getHouseholdWealth(3)).toBeCloseTo(1000, 6);

      // Demanding more than the two wallets hold together collects only what exists.
      const overdrawn = drawStateUrbanHouseholdWealth(1, 10_000);
      expect(overdrawn).toBeCloseTo(20, 6);
      expect(getHouseholdWealth(1)).toBe(0);
      expect(getHouseholdWealth(2)).toBe(0);
    });
  });

  describe("rural leg (per-Market wallets, apportioned by cells.state)", () => {
    function setUpSplitMarket(): Market {
      // Market 1's catchment: cells 1,2 (state 1, pop 10+5=15) and cell 3 (state 2, pop 5) — a
      // catchment straddling a border, out of 20 total rural population.
      worldContext.pack.cells = {
        i: [1, 2, 3],
        h: [0, 25, 25, 25],
        pop: [0, 10, 5, 5],
        state: [0, 1, 1, 2]
      } as unknown as PackedGraph["cells"];
      setMarketCellColumn(Uint16Array.from([0, 1, 1, 1]));
      const market = { i: 1, centerBurgId: 0, color: "#fff", goods: {} } as Market;
      setMarkets([market]);
      return market;
    }

    it("reports no rural land for a state that owns none", () => {
      expect(stateOwnsRuralLand(1)).toBe(false);
      expect(drawStateRuralHouseholdWealth(1, 100)).toBe(0);
    });

    it("seeds, credits, and debits a Market's rural wallet directly", () => {
      const market = setUpSplitMarket();
      expect(getRuralHouseholdWealth(market)).toBe(0); // no foodLedger yet.

      // ruralHouseholdWealth: 0 (rather than leaving it undefined) opts out of the lazy
      // population-based seed, so this test's numbers are the credit/debit math alone.
      market.foodLedger = {
        ruralFoodStressQuarters: 0,
        urbanFoodStressQuarters: 0,
        ruralHouseholdWealth: 0
      } as never;
      creditRuralHouseholdWealth(market, 50);
      expect(getRuralHouseholdWealth(market)).toBeCloseTo(50, 6);

      const debited = debitRuralHouseholdWealth(market, 20);
      expect(debited).toBeCloseTo(20, 6);
      expect(getRuralHouseholdWealth(market)).toBeCloseTo(30, 6);
    });

    it("splits one Market's rural wallet across the two states whose cells feed it, pro-rata by population", () => {
      const market = setUpSplitMarket();
      // ruralHouseholdWealth: 0 (rather than leaving it undefined) opts out of the lazy
      // population-based seed, so this test's numbers are the credit/debit math alone.
      market.foodLedger = {
        ruralFoodStressQuarters: 0,
        urbanFoodStressQuarters: 0,
        ruralHouseholdWealth: 0
      } as never;
      creditRuralHouseholdWealth(market, 100);

      expect(stateOwnsRuralLand(1)).toBe(true);
      expect(stateOwnsRuralLand(2)).toBe(true);
      expect(stateOwnsRuralLand(0)).toBe(false); // cell 0 (index padding) belongs to neither.

      // State 1 owns 15/20 = 75% of the rural population under this Market.
      const collected1 = drawStateRuralHouseholdWealth(1, 1000);
      expect(collected1).toBeCloseTo(75, 6);
      expect(getRuralHouseholdWealth(market)).toBeCloseTo(25, 6);

      // State 2's own 25% share is untouched by State 1's draw above.
      const collected2 = drawStateRuralHouseholdWealth(2, 1000);
      expect(collected2).toBeCloseTo(25, 6);
      expect(getRuralHouseholdWealth(market)).toBeCloseTo(0, 6);
    });

    it("does not let stale cross-state bookkeeping leak into the next settlement cycle", () => {
      const market = setUpSplitMarket();
      market.foodLedger = {
        ruralFoodStressQuarters: 0,
        urbanFoodStressQuarters: 0,
        ruralHouseholdWealth: 0
      } as never;
      creditRuralHouseholdWealth(market, 100);
      resetRuralHouseholdWealthCycleTracking(); // taxes-generator.ts calls this once per cycle.

      expect(drawStateRuralHouseholdWealth(1, 1000)).toBeCloseTo(75, 6);

      // A new month's farmgate payment replenishes the wallet before the next cycle's poll tax.
      creditRuralHouseholdWealth(market, 100);
      resetRuralHouseholdWealthCycleTracking();

      // Without the reset, State 1's now-stale "already collected 75" would still be added to
      // this cycle's baseline, inflating both states' entitlement past what the wallet holds.
      expect(drawStateRuralHouseholdWealth(1, 1000)).toBeCloseTo(93.75, 6); // 75% of (25 + 100)
      expect(drawStateRuralHouseholdWealth(2, 1000)).toBeCloseTo(31.25, 6); // 25% of (25 + 100)
    });
  });
});
