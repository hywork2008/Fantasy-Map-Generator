/**
 * Stub treasury income for history-mode runs (docs/plan/advance-time-history-mode.md §6).
 *
 * ## Why this exists
 *
 * History mode switches most of the economy tick off, but the systems it keeps still *spend*:
 * frontier governance buys border works, war costs money, and `frontierGovernance.ts` decides
 * whether a realm takes an expansion posture at all by checking `treasury >= 30`. Fast-Forward's
 * own treasury model cannot sustain that over decades — it is purely multiplicative
 * (`treasury * (1 + r) ** years`, clamped at 0), so with the calibrated Steady rate of -13%/yr a
 * 50-year run leaves every treasury at ~0.1% of its starting value, and zero is an absorbing
 * state no preset can climb out of. Every realm goes broke, every realm drops to a balanced
 * posture, borders stop moving, and the run produces no history.
 *
 * So while a history-mode run is active this replaces that model with an additive, population-
 * proportional income:
 *
 *     income  = revenuePerCapitaPerYear * population * yearsElapsed
 *     upkeep  = income * upkeepRatio * (atWar ? warUpkeepMultiplier : 1)
 *     balance = balance + income - upkeep      (then floored at floorRatio * annual income)
 *
 * Two properties matter more than the exact numbers. It has no absorbing zero, so a realm that
 * loses a war can recover. And because income scales with population, a realm that conquers
 * territory can afford more war than one that loses it — which is what turns a sequence of
 * battles into an actual rise and fall rather than noise.
 *
 * `upkeepRatio` and `warUpkeepMultiplier` are the decline knobs: a long war under a >1 product
 * eats a realm's treasury and eventually stops its expansion, without any separate "collapse"
 * rule needing to exist.
 */
import type { PackedGraph } from "../../types/PackedGraph";
import type { StubFundingConfig } from "./historyModeProfiles";

/** Per-state totals accumulated in one pass over the pack. */
interface StatePopulations {
  /** Indexed by state id; index 0 (neutral land) is accumulated but never funded. */
  readonly byState: Float64Array;
}

/**
 * Sums rural cell population and burg population per state.
 *
 * Deliberately recomputed from `cells.pop` / `burg.population` rather than read from
 * `state.rural` / `state.urban`: those summaries are refreshed by systems history mode may have
 * switched off, so they can be stale by decades in the middle of a run.
 */
function collectStatePopulations(pack: PackedGraph): StatePopulations {
  const stateCount = pack.states?.length ?? 0;
  const byState = new Float64Array(Math.max(1, stateCount));
  const cells = pack.cells;

  if (cells?.i && cells.state && cells.pop) {
    for (const i of cells.i) {
      const stateId = cells.state[i];
      if (stateId > 0 && stateId < byState.length) byState[stateId] += cells.pop[i] ?? 0;
    }
  }
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    const stateId = burg.state ?? 0;
    if (stateId > 0 && stateId < byState.length) byState[stateId] += burg.population ?? 0;
  }

  return { byState };
}

export interface StubFundingResult {
  /** How many states had their treasury adjusted — used by tests and the run summary. */
  statesFunded: number;
  /** Net change applied across all state treasuries this call (negative when upkeep dominates). */
  netStateChange: number;
}

/**
 * Applies one tick's worth of stub income to every living state and burg treasury.
 *
 * Called once per simulation tick with the tick's own elapsed years, so it behaves the same at a
 * daily stride as at a monthly one.
 */
export function applyHistoryStubFunding(
  pack: PackedGraph,
  yearsElapsed: number,
  config: StubFundingConfig,
  isAtWar: (stateId: number) => boolean
): StubFundingResult {
  const result: StubFundingResult = { statesFunded: 0, netStateChange: 0 };
  if (!config.enabled || !(yearsElapsed > 0) || !pack?.states) return result;

  const { byState } = collectStatePopulations(pack);

  for (const state of pack.states) {
    if (!state?.i || state.removed) continue;
    const population = byState[state.i] ?? 0;
    if (!(population > 0)) continue;

    const annualIncome = config.revenuePerCapitaPerYear * population;
    const income = annualIncome * yearsElapsed;
    const upkeepRate = config.upkeepRatio * (isAtWar(state.i) ? config.warUpkeepMultiplier : 1);
    const balance = (state.treasury ?? 0) + income - income * upkeepRate;
    // floorRatio is expressed against one *year* of income, so the safety net a user picks does
    // not silently change meaning with the tick stride.
    const floor = config.floorRatio > 0 ? config.floorRatio * annualIncome : 0;

    const next = Math.max(floor, balance);
    result.netStateChange += next - (state.treasury ?? 0);
    state.treasury = next;
    result.statesFunded += 1;
  }

  // Burgs get income without the war surcharge: a realm's campaigns are paid out of
  // `state.treasury`, so charging the war premium to both purses would bill the same war twice.
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    const population = burg.population ?? 0;
    if (!(population > 0)) continue;
    const annualIncome = config.revenuePerCapitaPerYear * population;
    const income = annualIncome * yearsElapsed;
    const balance = (burg.treasury ?? 0) + income - income * config.upkeepRatio;
    const floor = config.floorRatio > 0 ? config.floorRatio * annualIncome : 0;
    burg.treasury = Math.max(floor, balance);
  }

  return result;
}
