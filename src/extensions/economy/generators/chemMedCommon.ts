/**
 * Shared helpers for chemistry / medicine annual settlers.
 * Design: docs/plan/chemistry-medicine-knowledge-accumulation.md §4.2
 */

import { rn } from "../../hostUtils";
import { getGoods, getMarkets, getWorldContext } from "../economyContext";
import type { ChemistryFailureReason } from "./chemistryTypes";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";

export const APOTHECARY_BUDGET = 12;
export const EXPERIMENTAL_BUDGET = 16;
export const HOSPITAL_BUDGET = 20;
export const ACID_PLANT_BUDGET = 24;
/**
 * calibration TBD — slightly above ACID_PLANT_BUDGET: a catalytic-oxidation (Deacon process)
 * unit built alongside an existing acid works, not a standalone heavy plant like the fertilizer/
 * steel/ammonia lines below. See docs/plan/chlorine-production-vertical-slice.md §3.6.
 */
export const CHLORINE_PLANT_BUDGET = 26;
/** calibration TBD — slightly higher than ACID_PLANT_BUDGET; a later, larger-scale plant. */
export const PHOSPHATE_FERTILIZER_PLANT_BUDGET = 28;
/**
 * calibration TBD — the highest of the four State capital budgets (ACID_PLANT_BUDGET 24 <
 * PHOSPHATE_FERTILIZER_PLANT_BUDGET 28 < STEEL_CONVERTER_PLANT_BUDGET 32 < this). A high-pressure
 * catalytic ammonia plant is the most capital-intensive of the four historically.
 * See docs/plan/synthetic-ammonia-vertical-slice.md §3.6.
 */
export const SYNTHETIC_AMMONIA_PLANT_BUDGET = 40;
/**
 * calibration TBD — higher than STEEL_CONVERTER_PLANT_BUDGET(32), lower than
 * SYNTHETIC_AMMONIA_PLANT_BUDGET(40). A power station is a larger capital project than a Bessemer
 * converter but not as capital-intensive as a high-pressure catalytic ammonia plant.
 * See docs/plan/electric-power-and-telegraph.md §3.9.
 */
export const POWER_STATION_BUDGET = 36;
/** calibration TBD — lower than the four chemistry/metallurgy plant budgets above. A telegraph
 *  line is lightweight wiring-and-relay infrastructure, not a process plant. */
export const TELEGRAPH_LINE_BUDGET = 18;
/**
 * calibration TBD — the highest State capital budget in the economy: electrolytic reduction is
 * both the most electricity-intensive and (historically) most capital-intensive process in the
 * chemistry/metallurgy chain, above even SYNTHETIC_AMMONIA_PLANT_BUDGET(40).
 * See docs/plan/electrolytic-industry-vertical-slice.md §3.7.
 */
export const ELECTROLYSIS_PLANT_BUDGET = 42;
/**
 * calibration TBD — between TELEGRAPH_LINE_BUDGET(18) and STEEL_CONVERTER_PLANT_BUDGET(32). A
 * masonry weir/dam with intake works is a bigger civil project than wiring-and-relay infrastructure
 * but smaller than a Bessemer converter plant. See docs/plan/dam-flood-control-and-hydropower.md §3.
 */
export const DAM_BUDGET = 26;
/**
 * calibration TBD — sits between STEEL_CONVERTER_PLANT_BUDGET(32) and POWER_STATION_BUDGET(36),
 * above CHLORINE_PLANT_BUDGET(26): brine electrolysis is a genuinely new electrochemical process
 * (not "built alongside an existing acid works" the way the Deacon-process ChlorinePlants is),
 * but historically needs far less electricity per tonne of output than Hall-Héroult aluminum
 * reduction (~2.5-3.5 MWh/t Cl2 vs ~13-15 MWh/t Al) and no high-temperature bath or carbon-anode
 * consumption — clearly lighter than ELECTROLYSIS_PLANT_BUDGET(42), the ceiling.
 * See docs/plan/chlor-alkali-electrolysis-vertical-slice.md §3.7.
 */
export const CHLOR_ALKALI_PLANT_BUDGET = 34;
/**
 * calibration TBD — lightest State capital budget in the economy, between APOTHECARY_BUDGET(12)
 * and EXPERIMENTAL_BUDGET(16): a small cinnabar-roasting retort, not a bulk chemical works —
 * roadmap §9.5 explicitly frames Mercury recovery as small-scale ("少量生産"), well below the four
 * heavy plants (24-42) above. See docs/plan/cinnabar-mercury-vertical-slice.md §3.7.
 */
export const MERCURY_PLANT_BUDGET = 14;
/**
 * calibration TBD — a fractional-distillation refinery: heavier than
 * PHOSPHATE_FERTILIZER_PLANT_BUDGET(28), lighter than CHLOR_ALKALI_PLANT_BUDGET(34).
 * See docs/plan/petroleum-and-internal-combustion-vertical-slice.md §3.7.
 */
export const OIL_REFINERY_PLANT_BUDGET = 30;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** 0..1 Market.electricityStock read for a market — shared by ElectrolysisPlants and
 *  ChlorAlkaliPlants, the two State capital-equipment modules whose utilization is capped by
 *  electricity capacity, not just Good stock. Originally kept inline in electrolysisPlants.ts as
 *  a single-reader convenience (electrolytic-industry-vertical-slice.md §7 decision 4, "when a
 *  second electricity-consuming industry is added, consider sharing" — that moment is now). */
export function electricityCoverageForMarket(marketId: number): number {
  const market = getMarkets().find(entry => entry.i === marketId);
  return clamp01(Number(market?.electricityStock) || 0);
}

export function findGood(name: string) {
  return getGoods().find(good => good.name === name);
}

export function marketIdForBurg(burgId: number): number {
  const burg = getWorldContext().pack.burgs?.[burgId];
  return burg?.market ?? 0;
}

export function consumeNamed(marketId: number, name: string, amount: number): number {
  const good = findGood(name);
  if (!good || amount <= 0) return 0;
  if (!isGoodEnabled(good) && name !== "Sulfuric Acid") return 0;
  return Markets.consumeForSmelting(marketId, good.i, amount, 0.85);
}

export function addNamedStock(marketId: number, name: string, amount: number): number {
  const good = findGood(name);
  const market = getMarkets().find(entry => entry.i === marketId);
  if (!good || !market || amount <= 0) return 0;
  const row = market.goods[good.i] ?? { stock: 0, price: good.value };
  row.stock = rn((row.stock ?? 0) + amount, 4);
  market.goods[good.i] = row;
  return amount;
}

export function debitTreasury(stateId: number, amount: number): boolean {
  const state = getWorldContext().pack.states?.[stateId];
  if (!state?.i || state.removed || amount <= 0) return false;
  if ((state.treasury ?? 0) < amount) return false;
  state.treasury = rn((state.treasury ?? 0) - amount, 2);
  return true;
}

export function pickSponsorBurg(stateId: number): number | null {
  const burgs = getWorldContext().pack.burgs ?? [];
  const candidates = burgs.filter(burg => burg?.i && !burg.removed && burg.state === stateId && (burg.market ?? 0) > 0);
  if (!candidates.length) return null;
  const capital = candidates.find(burg => burg.capital);
  if (capital?.i) return capital.i;
  candidates.sort((a, b) => (a.sanitation ?? 50) - (b.sanitation ?? 50));
  return candidates[0]?.i ?? null;
}

export function recordFailure(
  previous: ChemistryFailureReason | undefined,
  reason: ChemistryFailureReason
): ChemistryFailureReason {
  return previous ?? reason;
}
