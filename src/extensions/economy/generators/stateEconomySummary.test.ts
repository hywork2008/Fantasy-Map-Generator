import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, MilitaryRegiment, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import "../types";
import type { Good } from "./goods-generator";
import type { Market } from "./marketTypes";
import { getStateFoodStockDays, getStateSurplus, refreshStateEconomySummaries } from "./stateEconomySummary";

const grain = { i: 1, name: "Grain", tags: ["food"], value: 1, unit: "ton", icon: "", color: "" } as Good;
const wood = { i: 2, name: "Wood", tags: ["construction"], value: 1, unit: "log", icon: "", color: "" } as Good;

describe("stateEconomySummary", () => {
  afterEach(() => {
    clearEconomyContext();
  });

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      states: [],
      burgs: [],
      markets: [],
      deals: [],
      goods: [grain, wood]
    } as unknown as PackedGraph;
  });

  describe("refreshStateEconomySummaries()", () => {
    it("aggregates only food-tagged good stock into state.foodStock, ignoring other goods", () => {
      const market = {
        i: 1,
        centerBurgId: 1,
        color: "#fff",
        goods: { 1: { stock: 100, price: 1 }, 2: { stock: 999, price: 1 } }
      } as Market;
      worldContext.pack.markets = [market];
      worldContext.pack.burgs = [
        { i: 0 } as unknown as Burg,
        { i: 1, market: 1, state: 1, population: 10 } as unknown as Burg
      ];
      const state1: State = { i: 1 } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];

      refreshStateEconomySummaries();

      expect(state1.foodStock).toBe(100);
    });

    it("apportions a market's food stock across states by burg population share", () => {
      const market = { i: 1, centerBurgId: 1, color: "#fff", goods: { 1: { stock: 100, price: 1 } } } as Market;
      worldContext.pack.markets = [market];
      worldContext.pack.burgs = [
        { i: 0 } as unknown as Burg,
        { i: 1, market: 1, state: 1, population: 30 } as unknown as Burg,
        { i: 2, market: 1, state: 2, population: 10 } as unknown as Burg
      ];
      const state1: State = { i: 1 } as unknown as State;
      const state2: State = { i: 2 } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1, state2];

      refreshStateEconomySummaries();

      expect(state1.foodStock).toBe(75);
      expect(state2.foodStock).toBe(25);
    });

    it("skips the neutral state (i === 0) and removed states", () => {
      const market = { i: 1, centerBurgId: 1, color: "#fff", goods: { 1: { stock: 50, price: 1 } } } as Market;
      worldContext.pack.markets = [market];
      worldContext.pack.burgs = [
        { i: 0 } as unknown as Burg,
        { i: 1, market: 1, state: 1, population: 10 } as unknown as Burg
      ];
      const neutral: State = { i: 0 } as unknown as State;
      const removed: State = { i: 2, removed: true } as unknown as State;
      worldContext.pack.states = [neutral, { i: 1 } as unknown as State, removed];

      refreshStateEconomySummaries();

      expect(neutral.foodStock).toBeUndefined();
      expect(removed.foodStock).toBeUndefined();
    });

    it("is a no-op when there are no states or markets", () => {
      worldContext.pack.states = [];
      worldContext.pack.markets = [];
      expect(() => refreshStateEconomySummaries()).not.toThrow();
    });
  });

  describe("getStateFoodStockDays()", () => {
    it("returns Infinity when the state has no military (zero daily consumption)", () => {
      const state: State = { i: 1, foodStock: 100 } as unknown as State;
      expect(getStateFoodStockDays(state)).toBe(Infinity);
    });

    it("divides food stock by daily army consumption", () => {
      const regiment = { u: { infantry: 10 } } as unknown as MilitaryRegiment;
      const state: State = { i: 1, foodStock: 10, military: [regiment] } as unknown as State;

      const days = getStateFoodStockDays(state);

      expect(days).toBeGreaterThan(0);
      expect(Number.isFinite(days)).toBe(true);
    });
  });

  describe("getStateSurplus()", () => {
    it("bundles treasury and foodStockDays for external consumers", () => {
      const state: State = { i: 1, treasury: 42, foodStock: 100 } as unknown as State;

      const surplus = getStateSurplus(state);

      expect(surplus.treasury).toBe(42);
      expect(surplus.foodStockDays).toBe(Infinity);
    });

    it("defaults treasury to 0 when unset", () => {
      const state: State = { i: 1 } as unknown as State;
      expect(getStateSurplus(state).treasury).toBe(0);
    });
  });
});
