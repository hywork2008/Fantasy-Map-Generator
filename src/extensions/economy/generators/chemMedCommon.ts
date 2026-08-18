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

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
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
