import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setAcademyKnowledgeStocks,
  setDeals,
  setMarkets
} from "../economyContext";
import { getStateFiscalReportState, type StateFiscalReport } from "../store/stateFiscalReportState";
import { Markets } from "./markets-generator";
import type { Market } from "./marketTypes";
import {
  clearStrategicProcurementExpenses,
  clearVoyageIncome,
  registerStrategicProcurementExpense,
  registerVoyageIncome,
  TaxesModule
} from "./taxes-generator";

/** civilAdministration.ts (PR-18) splits the former single administrativeUpkeep expense into 5 keys. */
const CIVIL_ADMINISTRATION_EXPENSE_KEYS = [
  "courts",
  "scribesNotaries",
  "taxFarmers",
  "messengers",
  "routineLocalAdministration"
] as const;

function sumCivilAdministrationExpenses(report: StateFiscalReport | undefined): number {
  if (!report) return 0;
  return CIVIL_ADMINISTRATION_EXPENSE_KEYS.reduce((sum, key) => sum + (report.expenses[key] ?? 0), 0);
}

describe("TaxesModule", () => {
  let taxesModule: TaxesModule;

  afterEach(() => {
    clearEconomyContext();
  });

  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    taxesModule = new TaxesModule();
    worldContext.options = {} as typeof worldContext.options;
    worldContext.pack = {
      states: [],
      burgs: [],
      markets: [],
      deals: []
    } as unknown as PackedGraph;
    clearVoyageIncome();
    clearStrategicProcurementExpenses();
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

    it("seeds a population-scaled public reserve for a new balanced State", () => {
      worldContext.options = { economyStartMode: "balanced" } as typeof worldContext.options;
      const state: State = { i: 1, name: "Kingdom", rural: 1_000, urban: 200 } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state];

      taxesModule.defineTaxRates();

      // population 1,200 * balanced profile's stateTreasuryPerPopulation (1.5, economyStartMode.ts)
      expect(state.treasury).toBe(1800);
    });

    it("seeds rates jittered around the form's base within the gauss bounds", () => {
      const state: State = { i: 1, name: "Theocracy of X", form: "Theocracy" } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state];

      taxesModule.defineTaxRates();

      // base salesTax 0.25, bounds [0.125, 0.375]; base pollTax 0.3, bounds [0.15, 0.45]
      expect(state.salesTax).toBeGreaterThanOrEqual(0.13);
      expect(state.salesTax).toBeLessThanOrEqual(0.37);
      expect(state.pollTax).toBeGreaterThanOrEqual(0.15);
      expect(state.pollTax).toBeLessThanOrEqual(0.45);
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

    // docs/plan/economy-coupling-audit.md L10
    it("seeds importDuty as half of salesTax for a brand-new state", () => {
      const state: State = { i: 1, name: "Freehold", form: "Anarchy" } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state];

      taxesModule.defineTaxRates();

      expect(state.salesTax).toBe(0);
      expect(state.importDuty).toBe(0);
    });

    it("seeds importDuty from a jittered salesTax proportionally", () => {
      const state: State = { i: 1, name: "Theocracy of X", form: "Theocracy" } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state];

      taxesModule.defineTaxRates();

      // 1-decimal tolerance: importDuty is rn(salesTax * 0.5, 2), so an already-rounded salesTax
      // can land importDuty one hundredth off plain-JS (salesTax * 0.5) at the rounding boundary.
      expect(state.importDuty).toBeCloseTo((state.salesTax ?? 0) * 0.5, 1);
    });

    it("backfills importDuty on an already-migrated state whose salesTax predates this feature", () => {
      // Simulates a map saved before L10 existed: salesTax already set (so the salesTax/pollTax/
      // treasury block above never re-enters), importDuty never seeded.
      const state: State = {
        i: 1,
        name: "Old Save",
        form: "Republic",
        salesTax: 0.2,
        pollTax: 0.4
      } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state];

      taxesModule.defineTaxRates();

      expect(state.salesTax).toBe(0.2); // untouched
      expect(state.importDuty).toBe(0.1); // backfilled from the state's own (possibly edited) salesTax
    });

    it("does not overwrite an already-set (possibly user-edited) importDuty", () => {
      const state: State = {
        i: 1,
        name: "Edited",
        form: "Republic",
        salesTax: 0.2,
        pollTax: 0.4,
        importDuty: 0.75
      } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state];

      taxesModule.defineTaxRates();

      expect(state.importDuty).toBe(0.75);
    });
  });

  describe("collectTaxes()", () => {
    it("uses balanced-mode ordinary administration before income can accumulate as Treasury", () => {
      worldContext.options = { economyStartMode: "balanced" } as typeof worldContext.options;
      const state: State = {
        i: 1,
        salesTax: 0,
        pollTax: 1,
        rural: 1,
        urban: 0,
        treasury: 0
      } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state];

      taxesModule.collectTaxes();

      expect(state.treasury || 0).toBeLessThan(0.5);
    });

    it("credits deal.tax from burg-sell deals to the seller's state treasury", () => {
      const state1: State = { i: 1, salesTax: 0.2, pollTax: 0, rural: 0, urban: 0 } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, { i: 1, state: 1 } as unknown as Burg];
      setDeals([
        { i: 0, seller: 1, sellerType: "burg", buyer: 1, buyerType: "market", good: 0, units: 5, price: 10, tax: 12 }
      ]);

      taxesModule.collectTaxes();

      expect(state1.treasury).toBe(12);
    });

    it("credits deal.tax from market-sell (global trade) deals via the market's center burg's state", () => {
      const state1: State = { i: 1, salesTax: 0.2, pollTax: 0, rural: 0, urban: 0 } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];
      worldContext.pack.burgs = [{ i: 0 } as unknown as Burg, { i: 1, state: 1 } as unknown as Burg];
      setMarkets([{ i: 1, centerBurgId: 1, color: "#fff", goods: {} } as Market]);
      setDeals([
        { i: 0, seller: 1, sellerType: "market", buyer: 2, buyerType: "market", good: 0, units: 5, price: 10, tax: 7 }
      ]);
      Markets.sync();

      taxesModule.collectTaxes();

      expect(state1.treasury).toBe(7);
    });

    // docs/plan/economy-coupling-audit.md L10
    it("credits deal.importTax from market-buy (global trade) deals to the buyer's state, independently of deal.tax to the seller's state", () => {
      const sellerState: State = { i: 1, salesTax: 0.2, pollTax: 0, rural: 0, urban: 0 } as unknown as State;
      const buyerState: State = { i: 2, salesTax: 0.1, pollTax: 0, rural: 0, urban: 0 } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, sellerState, buyerState];
      worldContext.pack.burgs = [
        { i: 0 } as unknown as Burg,
        { i: 1, state: 1 } as unknown as Burg,
        { i: 2, state: 2 } as unknown as Burg
      ];
      setMarkets([
        { i: 1, centerBurgId: 1, color: "#fff", goods: {} } as Market,
        { i: 2, centerBurgId: 2, color: "#fff", goods: {} } as Market
      ]);
      setDeals([
        {
          i: 0,
          seller: 1,
          sellerType: "market",
          buyer: 2,
          buyerType: "market",
          good: 0,
          units: 5,
          price: 10,
          tax: 7,
          importTax: 9
        }
      ]);
      Markets.sync();

      taxesModule.collectTaxes();

      expect(sellerState.treasury).toBe(7);
      expect(buyerState.treasury).toBe(9);
      const report = getStateFiscalReportState().reports.find(r => r.stateId === 2);
      expect(report?.income.importDuty).toBe(9);
    });

    it("does not credit import duty anywhere for a deal with no importTax", () => {
      const sellerState: State = { i: 1, salesTax: 0, pollTax: 0, rural: 0, urban: 0 } as unknown as State;
      const buyerState: State = { i: 2, salesTax: 0, pollTax: 0, rural: 0, urban: 0 } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, sellerState, buyerState];
      worldContext.pack.burgs = [
        { i: 0 } as unknown as Burg,
        { i: 1, state: 1 } as unknown as Burg,
        { i: 2, state: 2 } as unknown as Burg
      ];
      setMarkets([
        { i: 1, centerBurgId: 1, color: "#fff", goods: {} } as Market,
        { i: 2, centerBurgId: 2, color: "#fff", goods: {} } as Market
      ]);
      setDeals([
        { i: 0, seller: 1, sellerType: "market", buyer: 2, buyerType: "market", good: 0, units: 5, price: 10, tax: 0 }
      ]);
      Markets.sync();

      taxesModule.collectTaxes();

      expect(buyerState.treasury).toBe(0);
    });

    it("adds poll tax based on rural + urban population", () => {
      // form Republic → household 5% of income credits L1; remainder stays L2.
      const state1: State = {
        i: 1,
        form: "Republic",
        salesTax: 0,
        pollTax: 0.5,
        rural: 100,
        urban: 50
      } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];
      worldContext.pack.burgs = [];
      setDeals([]);

      taxesModule.collectTaxes();

      // income 75; PR-7/8 tax farm ~8% (support-scaled); HH 5% = 3.75; depts get the rest
      expect(state1.householdPurse).toBe(3.75);
      expect(state1.treasury).toBeLessThanOrEqual(0.05);
      const deptSum =
        (state1.departmentBalances?.marshalcy || 0) +
        (state1.departmentBalances?.chancery || 0) +
        (state1.departmentBalances?.stewardship || 0) +
        (state1.departmentBalances?.spymastery || 0) +
        (state1.departmentBalances?.ecclesiastica || 0);
      expect(deptSum).toBeCloseTo(75 - 3.75 - (state1.lastTaxFarmLeak || 0) - (state1.treasury || 0), 1);
      expect(deptSum).toBeGreaterThan(60);
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
      setDeals([
        { i: 0, seller: 0, sellerType: "burg", buyer: 1, buyerType: "market", good: 0, units: 1, price: 1, tax: 999 }
      ]);

      taxesModule.collectTaxes();

      expect(neutral.treasury).toBe(0);
    });

    it("scales poll tax revenue up by the capital's administration academy bonus", () => {
      const state1: State = {
        i: 1,
        form: "Republic",
        salesTax: 0,
        pollTax: 0.5,
        rural: 100,
        urban: 50,
        capital: 1
      } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];
      worldContext.pack.burgs = [];
      setDeals([]);
      setAcademyKnowledgeStocks([{ burgId: 1, domain: "administration", stock: 1 }]);

      taxesModule.collectTaxes();

      // Baseline (no bonus) would be 75; ACADEMY_BONUS_MAX = 0.2 at stock = 1 raises it to 90.
      // Tax farm ~8% (support-scaled); HH 4.5; depts get the residual L2 after farm.
      expect(state1.householdPurse).toBe(4.5);
      expect(state1.treasury).toBeLessThanOrEqual(0.05);
      const deptSum =
        (state1.departmentBalances?.marshalcy || 0) +
        (state1.departmentBalances?.chancery || 0) +
        (state1.departmentBalances?.stewardship || 0) +
        (state1.departmentBalances?.spymastery || 0) +
        (state1.departmentBalances?.ecclesiastica || 0);
      expect(deptSum).toBeGreaterThan(70);
      expect(deptSum).toBeLessThan(86);
    });

    it("carries forward the existing balance instead of resetting to 0", () => {
      const state1: State = { i: 1, salesTax: 0, pollTax: 0, rural: 0, urban: 0, treasury: 500 } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];
      worldContext.pack.burgs = [];
      setDeals([]);

      taxesModule.collectTaxes();

      expect(state1.treasury).toBe(500);
    });

    it("folds in Shipbuilding's buffered voyage income (docs/plan/ships.md 航海訓練・偽装通商・諜報)", () => {
      const state1: State = {
        i: 1,
        form: "Republic",
        salesTax: 0,
        pollTax: 0,
        rural: 0,
        urban: 0
      } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];
      worldContext.pack.burgs = [];
      setDeals([]);
      registerVoyageIncome(1, 40);
      registerVoyageIncome(1, 10); // accumulates across multiple voyage-income events in one cycle

      taxesModule.collectTaxes();

      // income 50; tax farm ~8%; HH 2.5; residual to depts / tiny L2 rounding
      expect(state1.householdPurse).toBe(2.5);
      expect(state1.treasury).toBeLessThanOrEqual(0.05);
    });

    it("consumes the voyage income buffer — a second collectTaxes() call without new income adds nothing more (but keeps the carried-forward balance)", () => {
      const state1: State = {
        i: 1,
        form: "Republic",
        salesTax: 0,
        pollTax: 0,
        rural: 0,
        urban: 0
      } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];
      worldContext.pack.burgs = [];
      setDeals([]);
      registerVoyageIncome(1, 40);

      taxesModule.collectTaxes();
      taxesModule.collectTaxes();

      // First cycle: 40 income → HH 2 + farm + depts. Second: income 0, stocks unchanged.
      expect(state1.householdPurse).toBe(2);
      expect(state1.treasury).toBeLessThanOrEqual(0.05);
    });

    it("subtracts state-funded strategic procurement from the next fiscal recalculation exactly once", () => {
      const state1: State = {
        i: 1,
        form: "Republic",
        salesTax: 0,
        pollTax: 1,
        rural: 100,
        urban: 0
      } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];
      worldContext.pack.burgs = [];
      setDeals([]);
      registerStrategicProcurementExpense(1, 30);

      taxesModule.collectTaxes();
      // income 100, tax farm 8; HH 5; depts from remainder; procurement from L2 (0) → L2 stays 0
      expect(state1.householdPurse).toBe(5);
      expect(state1.treasury).toBe(0);

      taxesModule.collectTaxes();
      // +100 again; HH ~10; procurement buffer empty. Very slightly under 10 (PR-17b): cycle 1
      // left Stewardship's departmentServiceLevel a hair below 1, and that one-cycle-lagged
      // shortfall trims this cycle's administration bonus by the same hair.
      expect(state1.householdPurse).toBe(9.98);
      expect(state1.treasury).toBe(0);
    });

    it("pays military troop upkeep from L3a.marshalcy even when L2 is empty after department credit (PR-5)", () => {
      // Republic HH 5% / marshalcy 30% of income. Infantry 100 heads → Need 12.
      const state1: State = {
        i: 1,
        form: "Republic",
        salesTax: 0,
        pollTax: 1,
        rural: 100,
        urban: 0,
        military: [{ state: 1, u: { Infantry: 100 } }]
      } as unknown as State;
      worldContext.pack.states = [{ i: 0 } as unknown as State, state1];
      worldContext.pack.burgs = [];
      setDeals([]);

      taxesModule.collectTaxes();

      // income 100, tax farm 8 → L2 92; HH 5; depts get 87 of desired 95 (pro-rata).
      // marshalcy credit = 30 * 87/95 = 27.47; upkeep 12 → 15.47
      expect(state1.householdPurse).toBe(5);
      expect(state1.treasury).toBe(0);
      expect(state1.departmentBalances?.marshalcy).toBeCloseTo(15.47, 1);
    });

    describe("Stewardship service level effect on administration (PR-17b)", () => {
      function makeState(stewardshipServiceLevel: number): State {
        return {
          i: 1,
          form: "Monarchy",
          salesTax: 0,
          pollTax: 1,
          rural: 100,
          urban: 0,
          departmentServiceLevel: {
            chancery: 1,
            stewardship: stewardshipServiceLevel,
            spymastery: 1,
            ecclesiastica: 1
          }
        } as unknown as State;
      }

      it("charges no extra administrative upkeep and no tax-efficiency penalty when fully funded", () => {
        const state = makeState(1);
        worldContext.pack.states = [{ i: 0 } as unknown as State, state];
        worldContext.pack.burgs = [];
        setDeals([]);

        taxesModule.collectTaxes();

        const report = getStateFiscalReportState().reports.at(-1);
        expect(sumCivilAdministrationExpenses(report)).toBe(0);
      });

      it("raises administrative upkeep and shrinks poll-tax collection when fully neglected", () => {
        const state = makeState(0);
        worldContext.pack.states = [{ i: 0 } as unknown as State, state];
        worldContext.pack.burgs = []; // no burgs to absorb any share — full amount stays with the state
        setDeals([]);

        taxesModule.collectTaxes();

        const report = getStateFiscalReportState().reports.at(-1);
        // administrationBonus shrinks by STEWARDSHIP_TAX_EFFICIENCY_PENALTY_MAX (0.15) →
        // pollTax revenue is 85% of the fully-funded case (population 100 × pollTax 1).
        expect(report?.income.pollTax).toBeCloseTo(100 * 0.85, 5);
        // administrativeUpkeepShare rises from 0 (provisioned profile default) to
        // STEWARDSHIP_UPKEEP_PENALTY_MAX_SHARE_POINTS (0.05) at full shortfall. civilAdministration.ts
        // (PR-18) splits this total into 5 named components, unchanged in sum with no burgs present.
        expect(sumCivilAdministrationExpenses(report)).toBeCloseTo((report?.income.pollTax ?? 0) * 0.05, 5);
      });
    });
  });
});
