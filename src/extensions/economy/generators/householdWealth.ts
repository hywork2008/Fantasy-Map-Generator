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
import { getMarketCellColumn, getMarkets, getWorldContext, isEconomyContextReady } from "../economyContext";
import { creditHouseholdWealth, debitHouseholdWealth, getHouseholdWealth } from "./burgMarketLedgers";
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
    market.foodLedger.ruralHouseholdWealth = transferToNewMarket(market) ?? seedRuralHouseholdWealth(market);
  }
  return market.foodLedger.ruralHouseholdWealth;
}

/**
 * A market founded mid-game takes over farms that already belonged to other markets, with their
 * cash. Seeding it from the start profile again duplicated that money every time a market town
 * was founded (docs/plan/initial-wealth-calibration.md §8). Instead it receives the average cash
 * per rural head for its people, taken pro rata from the existing purses. Returns null when no
 * market has a purse yet (a new map), so the start profile applies.
 */
function transferToNewMarket(market: Market): number | null {
  const others = getMarkets().filter(
    other => other !== market && other.foodLedger && other.foodLedger.ruralHouseholdWealth !== undefined
  );
  if (!others.length) return null;
  const { pack } = getWorldContext();
  if (!pack.cells?.i) return 0;
  const marketCellColumn = getMarketCellColumn();
  const ruralPopulation = new Map<number, number>();
  for (const cellId of pack.cells.i) {
    if (pack.cells.h[cellId] < 20) continue;
    const owner = marketCellColumn[cellId];
    ruralPopulation.set(owner, (ruralPopulation.get(owner) ?? 0) + Math.max(0, pack.cells.pop[cellId] ?? 0));
  }
  const pool = others.reduce((sum, other) => sum + Math.max(0, other.foodLedger!.ruralHouseholdWealth ?? 0), 0);
  const othersPopulation = others.reduce((sum, other) => sum + (ruralPopulation.get(other.i) ?? 0), 0);
  const own = ruralPopulation.get(market.i) ?? 0;
  if (!(pool > 0) || !(othersPopulation > 0) || !(own > 0)) return 0;
  const amount = Math.min(pool, (pool / othersPopulation) * own);
  let moved = 0;
  for (const other of others) {
    const wallet = Math.max(0, other.foodLedger!.ruralHouseholdWealth ?? 0);
    const take = rn((amount * wallet) / pool, 2);
    other.foodLedger!.ruralHouseholdWealth = rn(wallet - take, 2);
    moved += take;
  }
  return rn(moved, 2);
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

/** Rural population points of State `stateId` inside one Market's catchment. */
function getStateRuralPopulation(stateId: number, market: Market): number {
  const { pack } = getWorldContext();
  if (!pack.cells?.i) return 0;
  const marketCellColumn = getMarketCellColumn();
  let rural = 0;
  for (const cellId of pack.cells.i) {
    if (marketCellColumn[cellId] !== market.i || pack.cells.h[cellId] < 20) continue;
    if (pack.cells.state?.[cellId] === stateId) rural += Math.max(0, pack.cells.pop[cellId] ?? 0);
  }
  return rural;
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

/**
 * A capital's population counts this many times over when a State's payroll is spread across its
 * towns: the court, chancery and garrison headquarters sit there. docs/plan/initial-wealth-calibration.md §5.2.
 */
export const CAPITAL_PAYROLL_WEIGHT = 3;

/**
 * Pays public money out as wages and purchases where the State's people live: clerks, judges and
 * soldiers in its towns (the capital weighted up), carters and labourers in its countryside. Before
 * this, administration and troop upkeep left the economy entirely, so households drained into the
 * treasury and never refilled. Returns the amount placed (0 when the State has no towns; the
 * caller's money then leaves the economy as before).
 */
export function payStateHouseholds(stateId: number, amount: number): number {
  if (!(amount > 0) || !Number.isFinite(amount) || !isEconomyContextReady()) return 0;
  const burgs = getStateBurgs(stateId);
  if (!burgs.length) return 0;
  const capitalId = getWorldContext().pack.states?.[stateId]?.capital;
  const townWeight = (burg: Burg) =>
    Math.max(0, burg.population ?? 0) * (burg.i === capitalId ? CAPITAL_PAYROLL_WEIGHT : 1);
  const townTotal = burgs.reduce((sum, burg) => sum + townWeight(burg), 0);
  const ruralByMarket = getMarkets()
    .map(market => ({ market, rural: getStateRuralPopulation(stateId, market) }))
    .filter(entry => entry.rural > 0);
  const ruralTotal = ruralByMarket.reduce((sum, entry) => sum + entry.rural, 0);
  const total = townTotal + ruralTotal;
  if (!(total > 0)) {
    for (const burg of burgs) creditHouseholdWealth(burg.i, rn(amount / burgs.length, 2));
    return amount;
  }
  for (const { market, rural } of ruralByMarket) creditRuralHouseholdWealth(market, rn((amount * rural) / total, 2));
  for (const burg of burgs) {
    const weight = townWeight(burg);
    if (weight > 0) creditHouseholdWealth(burg.i, rn((amount * weight) / total, 2));
  }
  return amount;
}

/** Money spent in one town (a character's living costs): it reaches that town's households. */
export function spendInBurg(burgId: number | undefined, amount: number): boolean {
  if (!burgId || !(amount > 0) || !isEconomyContextReady()) return false;
  const burg = getWorldContext().pack.burgs?.[burgId];
  if (!burg?.i || burg.removed) return false;
  creditHouseholdWealth(burgId, amount);
  return true;
}

/** Months of the start profile's household cash a town keeps before spending on trades and services. */
export const URBAN_HOUSEHOLD_BUFFER_MONTHS = 12;
/** Share of the cash above that buffer spent each month in the town. */
export const URBAN_HOUSEHOLD_SPEND_SHARE = 0.2;

/**
 * Town households spend cash above their buffer on local trades and services (bakers' bread aside:
 * clothes, repairs, carting, ale, rent). That spending is the town's business income, credited to
 * `burg.treasury`, which pays local works and remits to the State. Without it, wages paid into a
 * town only piled up. docs/plan/initial-wealth-calibration.md §5.2.
 */
export function spendUrbanHouseholdSurplus(): number {
  if (!isEconomyContextReady()) return 0;
  const { pack } = getWorldContext();
  const profile = getEconomyStartProfile(getWorldContext().options ?? {});
  let spent = 0;
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    const buffer = (burg.population ?? 0) * profile.householdWealthPerPopulation * (URBAN_HOUSEHOLD_BUFFER_MONTHS / 12);
    const excess = getHouseholdWealth(burg.i) - buffer;
    if (!(excess > 0)) continue;
    const amount = debitHouseholdWealth(burg.i, rn(excess * URBAN_HOUSEHOLD_SPEND_SHARE, 2));
    if (!(amount > 0)) continue;
    burg.treasury = rn((burg.treasury ?? 0) + amount, 2);
    spent += amount;
  }
  return rn(spent, 2);
}

/** Share of a market's rural purse its farm families spend each month in the market's towns. */
export const RURAL_HOUSEHOLD_TOWN_SPEND_SHARE = 0.05;

/**
 * Farm families buy what the farm does not make — salt, tools, cloth, pots, the smith, the miller,
 * the fair — in their market's towns (docs/plan/craft-wage-subsistence-scale.md §9). The money is
 * the towns' business income, credited to `burg.treasury` by town population, which then pays
 * craft wages. Before this, rural cash went only to the poll tax and town people's food money
 * never came back to them.
 */
export function spendRuralHouseholdsInTowns(): number {
  if (!isEconomyContextReady()) return 0;
  const { pack } = getWorldContext();
  const townsByMarket = new Map<number, Burg[]>();
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed || !burg.market || !((burg.population ?? 0) > 0)) continue;
    const towns = townsByMarket.get(burg.market) ?? [];
    towns.push(burg);
    townsByMarket.set(burg.market, towns);
  }
  let spent = 0;
  for (const market of getMarkets()) {
    const towns = townsByMarket.get(market.i);
    if (!towns?.length) continue;
    const purse = getRuralHouseholdWealth(market);
    if (!(purse > 0)) continue;
    const amount = debitRuralHouseholdWealth(market, rn(purse * RURAL_HOUSEHOLD_TOWN_SPEND_SHARE, 2));
    if (!(amount > 0)) continue;
    const population = towns.reduce((sum, burg) => sum + (burg.population ?? 0), 0);
    for (const burg of towns)
      burg.treasury = rn((burg.treasury ?? 0) + (amount * (burg.population ?? 0)) / population, 2);
    spent = rn(spent + amount, 2);
  }
  return spent;
}

/** Months of operating cash a market keeps (per member-town population point, as town working cash). */
export const MARKET_CASH_RESERVE_PER_POPULATION_FACTOR = 1;
/** Share of a market's cash above its reserve paid out each month. */
export const MARKET_SURPLUS_PAYOUT_SHARE = 0.2;
/** Part of that payout kept by the market's merchants as profit; the rest is spent in its centre town. */
export const MARKET_MERCHANT_PROFIT_SHARE = 1 / 3;

/**
 * A market's margin (retail minus farmgate) used to pile up in `marketTreasury.balance` with no
 * outlet. Above an operating reserve it is now paid out: profit to the market's merchants and
 * spending (wages, carting, rents) in its centre town. docs/plan/initial-wealth-calibration.md §5.2.
 */
export function payOutMarketSurplus(creditMerchant: (characterId: number, amount: number) => boolean): number {
  if (!isEconomyContextReady()) return 0;
  const { pack } = getWorldContext();
  const profile = getEconomyStartProfile(getWorldContext().options ?? {});
  const memberPopulation = new Map<number, number>();
  for (const burg of pack.burgs ?? [])
    if (burg?.i && !burg.removed && burg.market)
      memberPopulation.set(burg.market, (memberPopulation.get(burg.market) ?? 0) + (burg.population ?? 0));
  let paid = 0;
  for (const market of getMarkets()) {
    const treasury = market.marketTreasury;
    if (!treasury) continue;
    const reserve =
      (memberPopulation.get(market.i) ?? 0) *
      profile.burgTreasuryPerPopulation *
      MARKET_CASH_RESERVE_PER_POPULATION_FACTOR;
    // Farmers are paid what they are owed from any cash, before the market keeps a reserve or
    // anyone takes a profit.
    const repay = rn(Math.min(Math.max(0, treasury.balance), Math.max(0, treasury.ruralGrainPayable)), 2);
    if (repay > 0) {
      treasury.ruralGrainPayable = rn(treasury.ruralGrainPayable - repay, 2);
      treasury.balance = rn(treasury.balance - repay, 2);
      creditRuralHouseholdWealth(market, repay);
      paid = rn(paid + repay, 2);
    }
    const excess = treasury.balance - reserve;
    if (!(excess > 0)) continue;
    const payout = rn(excess * MARKET_SURPLUS_PAYOUT_SHARE, 2);
    const merchants = [market.managerCharacterId, ...(market.rivalCharacterIds ?? [])].filter(
      (id): id is number => typeof id === "number"
    );
    let profit = merchants.length ? rn(payout * MARKET_MERCHANT_PROFIT_SHARE, 2) : 0;
    if (profit > 0) {
      const each = rn(profit / merchants.length, 2);
      profit = 0;
      for (const id of merchants) if (creditMerchant(id, each)) profit = rn(profit + each, 2);
    }
    const local = rn(payout - profit, 2);
    if (!spendInBurg(market.centerBurgId, local)) {
      if (!(profit > 0)) continue;
      treasury.balance = rn(treasury.balance - profit, 2);
      paid = rn(paid + profit, 2);
      continue;
    }
    treasury.balance = rn(treasury.balance - payout, 2);
    paid = rn(paid + payout, 2);
  }
  return paid;
}
