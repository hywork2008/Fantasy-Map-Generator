import type { Burg } from "../../hostTypes";
import { gauss, rn, TIME } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import type { Deal } from "./markets-generator";
import { Markets } from "./markets-generator";

type TaxBases = { salesTax: number; pollTax: number };

const DEFAULT_TAX_BY_FORM: Record<string, TaxBases> = {
  Monarchy: { salesTax: 0.15, pollTax: 0.2 },
  Theocracy: { salesTax: 0.25, pollTax: 0.1 },
  Union: { salesTax: 0.07, pollTax: 0.13 },
  Republic: { salesTax: 0.05, pollTax: 0.15 },
  Anarchy: { salesTax: 0, pollTax: 0 }
};
const DEFAULT_TAX: TaxBases = DEFAULT_TAX_BY_FORM.Monarchy;

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

  /** Recomputes every non-neutral state's treasury from this generation cycle's deals plus poll tax. */
  collectTaxes(): void {
    TIME && console.time("collectTaxes");
    const { states, burgs, deals } = this.worldContext.pack;

    for (const state of states) {
      if (state.i) state.treasury = 0;
    }

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
      state.treasury = rn((state.treasury || 0) + (state.pollTax || 0) * population, 2);
    }

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
