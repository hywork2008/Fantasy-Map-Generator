import type { FastAdvanceRates } from "../../../generators/fastAdvance/fastAdvancePresets";
import type { RNGService } from "../../../utils/probabilityUtils";
import { rn } from "../../hostUtils";
import { getMarkets, getWorldContext } from "../economyContext";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Fast-Forward's replacement for the monthly `production.settle` command (docs/plan/
 * advance-time-fast-forward.md §4.5) — the ~85% of Advance Year's cost identified in §1. Applies a
 * flat annual growth rate to every Market Good's stock/price and every State/Burg treasury instead
 * of running Production.produce()/Taxes.collectTaxes()/the rest of the real settlement pipeline.
 *
 * `monthsElapsed` is whatever the caller's due-settlement count happens to be for this flush (see
 * src/extensions/economy/index.tsx's scheduleProductionSettlement()) — this is called once per
 * flush rather than once per due month, since exponential compounding is associative
 * ((1+r)^(a/12) * (1+r)^(b/12) == (1+r)^((a+b)/12)): splitting one multi-month batch into several
 * calls would only change how many jitter draws happen, not the expected outcome, and collapsing
 * to one call sidesteps a subtle dependency on exactly when the JS microtask queue happens to
 * flush (immediately per day for the UI's rAF loop vs. once at the end for a single bulk
 * `advanceTime()` call).
 *
 * The stock floor/cap (rates.stockFloorMultiplier/stockCapMultiplier) is relative to each Good's
 * stock at the start of *this* call — for an ordinary due-month flush that is a small bound with
 * little practical effect, but for a single large multi-year Fast-Forward batch (monthsElapsed in
 * the hundreds) it is exactly the anti-runaway rail §5.1 describes.
 *
 * Deliberately leaves refreshStateEconomySummaries()/synchronizePlayerCommerce() to the caller
 * (still run for real, §4.5/§4.6 — cheap, and Overview dialogs need them reflecting the new
 * treasury/stock) and skips MetallurgWork's methods, production:pricesAndLabor, etc. entirely —
 * Fast-Forward mode simply never calls them, which is the "skip candidate" §4.6 describes.
 */
export function applyFastForwardEconomySettlement(
  monthsElapsed: number,
  rates: FastAdvanceRates,
  rng: RNGService
): void {
  if (!(monthsElapsed > 0)) return;
  const yearsElapsed = monthsElapsed / 12;
  // Scaled by sqrt(yearsElapsed) for the same reason fastAdvancePopulation.ts scales its jitter by
  // sqrt(deltaYears): this function can be called repeatedly for the same Good/market over a long
  // Fast-Forward run (once per due-settlement flush — typically ~12x/year, but every call still
  // draws an independent jitter), and compounding many independent mean-1 multiplicative jitters
  // without this correction drives most values toward collapse while a rare few explode (docs/plan/
  // advance-time-fast-forward.md §9 finding, first observed via population's identical bug before
  // this file's jitter was corrected the same way). Scaling keeps the variance of the fully
  // compounded result consistent with a single one-shot annual draw at variancePct, regardless of
  // how many flushes a given year's due settlements end up split across.
  const jitterAmplitude = (rates.variancePct / 100) * Math.sqrt(yearsElapsed);
  const priceFactor = (1 + rates.priceInflationPctPerYear / 100) ** yearsElapsed;
  const stockFactorRaw = (1 + rates.goodsStockGrowthPctPerYear / 100) ** yearsElapsed;

  for (const market of getMarkets()) {
    for (const goodIdKey of Object.keys(market.goods)) {
      const entry = market.goods[Number(goodIdKey)];
      if (!entry) continue;
      const jitter = 1 + (rng.rand() * 2 - 1) * jitterAmplitude;
      entry.price = Math.max(0.01, rn(entry.price * priceFactor * jitter, 2));

      const baselineStock = entry.stock ?? 0;
      const stockFactor = clamp(stockFactorRaw * jitter, rates.stockFloorMultiplier, rates.stockCapMultiplier);
      entry.stock = Math.max(0, rn(baselineStock * stockFactor, 2));
    }
  }

  const treasuryFactor = (1 + rates.treasuryGrowthPctPerYear / 100) ** yearsElapsed;
  const { pack } = getWorldContext();
  for (const state of pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    state.treasury = Math.max(0, rn((state.treasury ?? 0) * treasuryFactor, 2));
  }
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    burg.treasury = Math.max(0, rn((burg.treasury ?? 0) * treasuryFactor, 2));
  }
}
