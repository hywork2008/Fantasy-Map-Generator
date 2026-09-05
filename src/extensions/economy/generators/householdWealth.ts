/**
 * L2 Phase 2/3 (docs/plan/economy-coupling-audit.md): closes the household loop Phase 1 only
 * half-opened. Two pooled cash wallets now exist — the urban one per Burg
 * (`BurgMarketLedger.householdWealth`, burgMarketLedgers.ts) and the rural one per Market
 * (`FoodLedger.ruralHouseholdWealth`, credited from foodProduction.ts's farmgate payments). This
 * module is where taxes-generator.ts's poll tax and foodLedgerConsumption.ts's urban food retail
 * actually draw from them — turning both from money creation into a real transfer, and (via urban
 * retail's affordability cap) connecting an empty wallet to L3 food stress.
 *
 * Rural population is not addressable by Burg — `drawRuralMonthlyNeed` already works cell-by-cell
 * under a Market's catchment — so the rural wallet lives on the Market's FoodLedger instead of
 * literally the same field as the urban one, and a State's share of it is apportioned by political
 * cell ownership (`cells.state`), not by the Market's center-Burg state: a Market's catchment can
 * straddle a border, and minting.ts's single-owner-market heuristic (fine for picking one mint)
 * would misattribute rural cash split across states.
 */

import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getMarketCellColumn, getMarkets, getWorldContext } from "../economyContext";
import { debitHouseholdWealth, getHouseholdWealth } from "./burgMarketLedgers";
import { getEconomyStartProfile } from "./economyStartMode";
import type { Market } from "./marketTypes";

/**
 * One-time bootstrap for a Market's rural household wallet, from the same population-point scale
 * as `householdWealthPerPopulation` — see that profile field's doc comment. `cells.pop` is
 * unscaled population points, the same unit `burg.population` uses.
 */
function seedRuralHouseholdWealth(market: Market): number {
  const { pack } = getWorldContext();
  if (!pack.cells?.i) return 0;
  const marketCellColumn = getMarketCellColumn();
  const profile = getEconomyStartProfile(getWorldContext().options ?? {});
  let ruralPopulationPoints = 0;
  for (const cellId of pack.cells.i) {
    if (marketCellColumn[cellId] !== market.i || pack.cells.h[cellId] < 20) continue;
    ruralPopulationPoints += Math.max(0, pack.cells.pop[cellId] ?? 0);
  }
  return rn(ruralPopulationPoints * profile.householdWealthPerPopulation, 2);
}

function ensureRuralHouseholdWealthSeeded(market: Market): number {
  if (!market.foodLedger) return 0;
  if (market.foodLedger.ruralHouseholdWealth === undefined) {
    market.foodLedger.ruralHouseholdWealth = seedRuralHouseholdWealth(market);
  }
  return market.foodLedger.ruralHouseholdWealth;
}

/** Reads a Market's current pooled rural household wallet balance, seeding it on first touch. */
export function getRuralHouseholdWealth(market: Market | undefined): number {
  if (!market?.foodLedger) return 0;
  return Math.max(0, ensureRuralHouseholdWealthSeeded(market));
}

/**
 * Credits a Market's rural household wallet — the farmgate payment's immediate cash portion
 * (foodProduction.ts's `settleFarmgatePayment`) and, later, its deferred `ruralGrainPayable` IOU
 * once urban retail revenue repays it (foodLedgerConsumption.ts's `settleUrbanRevenue`).
 */
export function creditRuralHouseholdWealth(market: Market | undefined, amount: number): void {
  if (!market?.foodLedger || !(amount > 0) || !Number.isFinite(amount)) return;
  const current = ensureRuralHouseholdWealthSeeded(market);
  market.foodLedger.ruralHouseholdWealth = rn(current + amount, 2);
}

/** Debits up to `amount` from a Market's rural household wallet. Returns the amount actually debited. */
export function debitRuralHouseholdWealth(market: Market | undefined, amount: number): number {
  if (!market?.foodLedger || !(amount > 0)) return 0;
  const available = Math.max(0, ensureRuralHouseholdWealthSeeded(market));
  const debited = rn(Math.min(available, amount), 2);
  if (debited <= 0) return 0;
  market.foodLedger.ruralHouseholdWealth = rn(available - debited, 2);
  return debited;
}

function getStateBurgs(stateId: number): Burg[] {
  return (getWorldContext().pack.burgs ?? []).filter(burg => burg.i && !burg.removed && burg.state === stateId);
}

/**
 * Whether State `stateId` has any Burg wallet infrastructure to draw poll tax from at all. A
 * state with zero Burgs (a minimal/synthetic fixture, or a burgless barbarian territory) has no
 * `BurgMarketLedger` to gate against — taxes-generator.ts falls back to pre-Phase-2 creation for
 * that state's urban poll-tax share rather than silently zeroing its revenue.
 */
export function stateHasBurgs(stateId: number): boolean {
  return getStateBurgs(stateId).length > 0;
}

/**
 * Debits up to `amount` of State `stateId`'s urban household cash, spread proportionally across
 * every Burg wallet it owns. Returns the amount actually collected.
 */
export function drawStateUrbanHouseholdWealth(stateId: number, amount: number): number {
  if (!(amount > 0)) return 0;
  const entries = getStateBurgs(stateId)
    .map(burg => ({ burg, wealth: getHouseholdWealth(burg.i) }))
    .filter(entry => entry.wealth > 0);
  const total = entries.reduce((sum, entry) => sum + entry.wealth, 0);
  if (total <= 0) return 0;

  const scale = Math.min(amount, total) / total;
  let collected = 0;
  for (const { burg, wealth } of entries) collected += debitHouseholdWealth(burg.i, rn(wealth * scale, 2));
  return rn(collected, 2);
}

/** This State's share of one Market's rural cell population — by political ownership, not the Market's center-Burg state. */
function getStateRuralPopulationShare(stateId: number, market: Market): number {
  const { pack } = getWorldContext();
  if (!pack.cells?.i) return 0;
  const marketCellColumn = getMarketCellColumn();
  let stateRural = 0;
  let totalRural = 0;
  for (const cellId of pack.cells.i) {
    if (marketCellColumn[cellId] !== market.i || pack.cells.h[cellId] < 20) continue;
    const pop = Math.max(0, pack.cells.pop[cellId] ?? 0);
    totalRural += pop;
    if (pack.cells.state?.[cellId] === stateId) stateRural += pop;
  }
  return totalRural > 0 ? stateRural / totalRural : 0;
}

/**
 * Whether State `stateId` politically owns any rural land at all (`cells.state`) — the data this
 * module's rural attribution needs. Missing/minimal cell data (a synthetic fiscal-math fixture)
 * makes taxes-generator.ts fall back to pre-Phase-2 creation for that state's rural poll-tax
 * share, the same reasoning as `stateHasBurgs` above.
 */
export function stateOwnsRuralLand(stateId: number): boolean {
  const { pack } = getWorldContext();
  if (!pack.cells?.i) return false;
  return pack.cells.i.some(cellId => pack.cells.h[cellId] >= 20 && pack.cells.state?.[cellId] === stateId);
}

/**
 * How much this settlement cycle's rural poll-tax draws have already taken out of a Market's
 * wallet, by Market id — reset once per cycle via `resetRuralHouseholdWealthCycleTracking()`.
 * Without this, a catchment split across two states would compute the second state's share
 * against the pool the first state's draw already shrank, systematically under-collecting
 * whichever state taxes-generator.ts happens to process second (docs/plan/economy-coupling-audit.md
 * L2 Phase 2/3). Restoring the pre-cycle baseline (`current wealth + already collected`) before
 * applying each state's share keeps every state's entitlement anchored to the same total
 * regardless of draw order.
 */
const ruralCollectedThisCycleByMarket = new Map<number, number>();

/**
 * Call once per settlement cycle, before any State's poll tax draws this month
 * (taxes-generator.ts's `collectTaxes()`), so a new month's farmgate credits don't inherit stale
 * bookkeeping from the last one.
 */
export function resetRuralHouseholdWealthCycleTracking(): void {
  ruralCollectedThisCycleByMarket.clear();
}

/**
 * Debits up to `amount` of State `stateId`'s rural household cash, spread proportionally across
 * every Market whose catchment includes land this State owns — each Market debited only by this
 * State's own population share of it, so a catchment split across a border leaves the other
 * state's share untouched. Returns the amount actually collected.
 */
export function drawStateRuralHouseholdWealth(stateId: number, amount: number): number {
  if (!(amount > 0)) return 0;
  const entries = getMarkets()
    .map(market => {
      const share = getStateRuralPopulationShare(stateId, market);
      const alreadyCollected = ruralCollectedThisCycleByMarket.get(market.i) ?? 0;
      const baseline = getRuralHouseholdWealth(market) + alreadyCollected;
      return { market, share, wealth: baseline * share };
    })
    .filter(entry => entry.share > 0 && entry.wealth > 0);
  const total = entries.reduce((sum, entry) => sum + entry.wealth, 0);
  if (total <= 0) return 0;

  const scale = Math.min(amount, total) / total;
  let collected = 0;
  for (const { market, wealth } of entries) {
    const debited = debitRuralHouseholdWealth(market, rn(wealth * scale, 2));
    collected += debited;
    if (debited > 0) {
      ruralCollectedThisCycleByMarket.set(market.i, (ruralCollectedThisCycleByMarket.get(market.i) ?? 0) + debited);
    }
  }
  return rn(collected, 2);
}
