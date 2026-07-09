import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import "../types";
import { Markets } from "./markets-generator";
import type { Market } from "./marketTypes";
import { TaxesModule } from "./taxes-generator";

describe("TaxesModule", () => {
  let taxesModule: TaxesModule;

  afterEach(() => {
    clearEconomyContext();
  });

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    taxesModule = new TaxesModule();
    worldContext.pack = {
      states: [],
      burgs: [],
      markets: [],
      deals: []
    } as unknown as PackedGraph;
  });

  describe("defineTaxRates()", () => {
    it("leaves the neutral state (i === 0) untouched", () => {
      const neutral: State = { i: 0, name: "Neutrals" } as unknown as State;
      worldContext.pack.states = [neutral];

      taxesModule.defineTaxRates();

      expect(neutral.salesTax).toBeUndefined();
      expect(neutral.pollTax).toBeUndefined();
      expect(neutral.treasury).toBeUndefined();
    });

    it("seeds Anarchy states to exactly zero rates", () => {
      const state: State = { i: 1, name: "Freehold", form: "Anarchy" } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state];

      taxesModule.defineTaxRates();

      expect(state.salesTax).toBe(0);
      expect(state.pollTax).toBe(0);
      expect(state.treasury).toBe(0);
    });

    it("seeds rates jittered around the form's base within the gauss bounds", () => {
      const state: State = { i: 1, name: "Theocracy of X", form: "Theocracy" } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state];

      taxesModule.defineTaxRates();

      // base salesTax 0.25, bounds [0.125, 0.375]; base pollTax 0.1, bounds [0.05, 0.15]
      expect(state.salesTax).toBeGreaterThanOrEqual(0.13);
      expect(state.salesTax).toBeLessThanOrEqual(0.37);
      expect(state.pollTax).toBeGreaterThanOrEqual(0.05);
      expect(state.pollTax).toBeLessThanOrEqual(0.15);
      expect(state.treasury).toBe(0);
    });

    it("falls back to Monarchy rates when form is missing", () => {
      const state: State = { i: 1, name: "Unknown Form" } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state];

      taxesModule.defineTaxRates();

      expect(state.salesTax).toBeGreaterThan(0);
      expect(state.pollTax).toBeGreaterThan(0);
    });

    it("is idempotent — does not overwrite an already-set (possibly user-edited) rate", () => {
      const state: State = {
        i: 1,
        name: "Edited",
        form: "Republic",
        salesTax: 0.99,
        pollTax: 0.01
      } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state];

      taxesModule.defineTaxRates();

      expect(state.salesTax).toBe(0.99);
      expect(state.pollTax).toBe(0.01);
    });
  });

  describe("collectTaxes()", () => {
    it("credits deal.tax from burg-sell deals to the seller's state treasury", () => {
      const state1: State = { i: 1, salesTax: 0.2, pollTax: 0, rural: 0, urban: 0 } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, { i: 1, state: 1 } as unknown as Burg];
      worldContext.pack.deals = [
        { i: 0, seller: 1, sellerType: "burg", buyer: 1, buyerType: "market", good: 0, units: 5, price: 10, tax: 12 }
      ] as PackedGraph["deals"];

      taxesModule.collectTaxes();

      expect(state1.treasury).toBe(12);
    });

    it("credits deal.tax from market-sell (global trade) deals via the market's center burg's state", () => {
      const state1: State = { i: 1, salesTax: 0.2, pollTax: 0, rural: 0, urban: 0 } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, { i: 1, state: 1 } as unknown as Burg];
      worldContext.pack.markets = [{ i: 1, centerBurgId: 1, color: "#fff", goods: {} } as Market];
      worldContext.pack.deals = [
        { i: 0, seller: 1, sellerType: "market", buyer: 2, buyerType: "market", good: 0, units: 5, price: 10, tax: 7 }
      ] as PackedGraph["deals"];
      Markets.sync();

      taxesModule.collectTaxes();

      expect(state1.treasury).toBe(7);
    });

    it("adds poll tax based on rural + urban population", () => {
      const state1: State = { i: 1, salesTax: 0, pollTax: 0.5, rural: 100, urban: 50 } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];
      worldContext.pack.burgs = [];
      worldContext.pack.deals = [];

      taxesModule.collectTaxes();

      expect(state1.treasury).toBe(75);
    });

    it("never credits the neutral state (i === 0)", () => {
      const neutral: State = {
        i: 0,
        salesTax: 0,
        pollTax: 999,
        rural: 100,
        urban: 100,
        treasury: 0
      } as unknown as State;
      worldContext.pack.states = [neutral];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg];
      worldContext.pack.deals = [
        { i: 0, seller: 0, sellerType: "burg", buyer: 1, buyerType: "market", good: 0, units: 1, price: 1, tax: 999 }
      ] as PackedGraph["deals"];

      taxesModule.collectTaxes();

      expect(neutral.treasury).toBe(0);
    });

    it("resets treasury to 0 before recomputing, rather than accumulating across calls", () => {
      const state1: State = { i: 1, salesTax: 0, pollTax: 0, rural: 0, urban: 0, treasury: 500 } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];
      worldContext.pack.burgs = [];
      worldContext.pack.deals = [];

      taxesModule.collectTaxes();

      expect(state1.treasury).toBe(0);
    });
  });
});
