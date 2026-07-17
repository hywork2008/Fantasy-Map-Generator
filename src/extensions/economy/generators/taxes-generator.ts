import type { Burg } from "../../hostTypes";
import { gauss, rn, TIME } from "../../hostUtils";
import { getDeals, getWorldContext } from "../economyContext";
import { Markets } from "./markets-generator";
import type { Deal } from "./marketTypes";
import { getStateMilitaryUpkeep } from "./militaryLogistics";

type TaxBases = { salesTax: number; pollTax: number };

const DEFAULT_TAX_BY_FORM: Record<string, TaxBases> = {
  Monarchy: { salesTax: 0.15, pollTax: 0.2 },
  Theocracy: { salesTax: 0.25, pollTax: 0.1 },
  Union: { salesTax: 0.07, pollTax: 0.13 },
  Republic: { salesTax: 0.05, pollTax: 0.15 },
  Anarchy: { salesTax: 0, pollTax: 0 }
};
const DEFAULT_TAX: TaxBases = DEFAULT_TAX_BY_FORM.Monarchy;

// Gold from Shipbuilding's trade-voyage ships (fmg:shipbuilding-voyage-income), buffered
// here until the next collectTaxes() fold-in — mirrors how `deals` represents "income
// since the last cycle" rather than a running total, so it composes cleanly with a
// treasury that now carries forward between cycles instead of resetting. See
// docs/plan/ships.md ("航海訓練・偽装通商・諜報（暫定案）").
const _voyageIncomeByState = new Map<number, number>();
// Procurement spends between collectTaxes() calls must be buffered here and folded into
// the next carry-forward update, since they happen outside collectTaxes() itself.
const _strategicProcurementExpenseByState = new Map<number, number>();

export function registerVoyageIncome(stateId: number, amount: number): void {
  _voyageIncomeByState.set(stateId, (_voyageIncomeByState.get(stateId) ?? 0) + amount);
}

export function clearVoyageIncome(): void {
  _voyageIncomeByState.clear();
}

export function registerStrategicProcurementExpense(stateId: number, amount: number): void {
  if (!stateId || !(amount > 0)) return;
  _strategicProcurementExpenseByState.set(stateId, (_strategicProcurementExpenseByState.get(stateId) ?? 0) + amount);
}

export function clearStrategicProcurementExpenses(): void {
  _strategicProcurementExpenseByState.clear();
}

export class TaxesModule {
  private get worldContext() {
    return getWorldContext();
  }

  /** Seeds salesTax/pollTax/treasury for any non-neutral state that doesn't have rates yet. Idempotent — never overwrites an already-set or user-edited rate. */
  defineTaxRates(): void {
    for (const state of this.worldContext.pack.states) {
      if (!state.i || state.salesTax !== undefined) continue;

      const { salesTax, pollTax } = DEFAULT_TAX_BY_FORM[state.form || ""] || DEFAULT_TAX;
      state.salesTax = rn(gauss(salesTax, salesTax * 0.15, salesTax * 0.5, salesTax * 1.5, 4), 2);
      state.pollTax = rn(gauss(pollTax, pollTax * 0.15, pollTax * 0.5, pollTax * 1.5, 4), 2);
      state.treasury = 0;
    }
  }

  /**
   * Folds this generation cycle's deals plus poll tax into every non-neutral state's treasury,
   * which is now a carry-forward stock rather than a from-scratch recalculation (docs/temp/profits.md
   * decision #1). The economy deals slice is cleared at the start of each Production.produce() cycle
   * (production-generator.ts), so the deals loop below only ever sees the current cycle's deals.
   */
  collectTaxes(): void {
    TIME && console.time("collectTaxes");
    const { states, burgs } = this.worldContext.pack;
    const deals = getDeals();

    for (const deal of deals) {
      if (!deal.tax) continue;
      const sellerStateId = this.getSellerStateId(deal, burgs);
      if (!sellerStateId) continue;
      const state = states[sellerStateId];
      if (!state) continue;
      state.treasury = rn((state.treasury || 0) + deal.tax, 2);
    }

    for (const state of states) {
      if (!state.i) continue;
      const population = (state.rural || 0) + (state.urban || 0);
      const voyageIncome = _voyageIncomeByState.get(state.i) ?? 0;
      const procurementExpense = _strategicProcurementExpenseByState.get(state.i) ?? 0;
      const militaryUpkeep = getStateMilitaryUpkeep(state);
      state.treasury = rn(
        Math.max(
          0,
          (state.treasury || 0) + (state.pollTax || 0) * population + voyageIncome - procurementExpense - militaryUpkeep
        ),
        2
      );
    }
    _voyageIncomeByState.clear();
    _strategicProcurementExpenseByState.clear();

    TIME && console.timeEnd("collectTaxes");
  }

  private getSellerStateId(deal: Deal, burgs: Burg[]): number | undefined {
    if (deal.sellerType === "burg") return burgs[deal.seller]?.state;

    const market = Markets.get(deal.seller);
    if (!market) return undefined;
    return burgs[market.centerBurgId]?.state;
  }
}

export const Taxes = new TaxesModule();
