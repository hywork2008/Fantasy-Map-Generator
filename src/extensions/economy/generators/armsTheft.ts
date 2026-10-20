/**
 * Theft of finished weapons from a market stock nobody buys (docs/plan/arms-theft.md).
 *
 * A market's Arms, Muskets and Artillery sell to a State's armory and to nobody else, so a stock the
 * armory no longer draws sits in the warehouse. The longer it sits, and the more restless the town
 * (civic discontent) or the less safe it is (public order), the more of it walks off. What is lost
 * is counted per burg: a store of weapons in unknown hands is a risk factor for an armed uprising.
 * Nothing reads the count yet.
 *
 * The age of a stock is tracked here, not in the market's goods: each month the tracked total is
 * matched to the real stock (growth is new, a fall is taken from the oldest first, as a buyer or a
 * thief would), then every month of age moves up one. All the rates are uncalibrated.
 */

import type { Burg } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getGoods, getMarkets, getWorldContext } from "../economyContext";
import { DISCONTENT_EFFECT_FLOOR, DISCONTENT_MAX } from "./burgDiscontent";
import { recordGoodFlow } from "./goodsBalanceLedger";
import type { Market } from "./marketTypes";

/** Finished weapons a thief can carry off; ammunition is held in State stockpiles instead. */
export const WEAPON_GOOD_NAMES: readonly string[] = ["Arms", "Muskets", "Artillery"];

/** Last bucket of `weaponStockAge`: this many months old or older. */
export const WEAPON_AGE_MAX_MONTHS = 12;
/** A stock younger than this is not yet "unsold for a long time". */
export const THEFT_MIN_AGE_MONTHS = 6;
/** Share of the lootable stock stolen per month in a town of maximal unrest. */
export const THEFT_MONTHLY_RATE_MAX = 0.03;
/** Public order at/above this adds no theft; at 0 it adds the most. Seeded burgs start at 50. */
export const SECURITY_THEFT_FLOOR = 50;
/** Stock below this is not tracked (rounding dust). */
const STOCK_EPSILON = 1e-4;

/** 0..1: how restless or unsafe the town is, whichever is worse. Unset discontent is 0; unset security is 50. */
export function getTheftUnrest(burg: Pick<Burg, "discontent" | "security"> | undefined): number {
  if (!burg) return 0;
  const discontent = Math.max(0, burg.discontent ?? 0);
  const fromDiscontent = Math.max(0, discontent - DISCONTENT_EFFECT_FLOOR) / (DISCONTENT_MAX - DISCONTENT_EFFECT_FLOOR);
  const security = Math.max(0, Math.min(100, burg.security ?? SECURITY_THEFT_FLOOR));
  const fromSecurity = Math.max(0, SECURITY_THEFT_FLOOR - security) / SECURITY_THEFT_FLOOR;
  return Math.min(1, Math.max(fromDiscontent, fromSecurity));
}

/** 0 below THEFT_MIN_AGE_MONTHS, rising to 1 at a year old. */
export function getLootableAgeWeight(ageMonths: number): number {
  if (ageMonths < THEFT_MIN_AGE_MONTHS) return 0;
  return Math.min(1, (ageMonths - THEFT_MIN_AGE_MONTHS + 1) / (WEAPON_AGE_MAX_MONTHS - THEFT_MIN_AGE_MONTHS + 1));
}

function emptyBuckets(): number[] {
  return Array.from({ length: WEAPON_AGE_MAX_MONTHS + 1 }, () => 0);
}

function sum(buckets: readonly number[]): number {
  return buckets.reduce((total, units) => total + units, 0);
}

/** Takes `units` out of the buckets, oldest first. Returns what was actually taken. */
function takeOldestFirst(buckets: number[], units: number): number {
  let left = units;
  for (let age = buckets.length - 1; age >= 0 && left > 0; age--) {
    const taken = Math.min(buckets[age], left);
    buckets[age] -= taken;
    left -= taken;
  }
  return units - left;
}

/** Matches the tracked ages to the market's real stock, then ages them by one month. */
function syncAges(buckets: number[], stock: number): void {
  const tracked = sum(buckets);
  if (stock > tracked) buckets[0] += stock - tracked;
  else if (stock < tracked) takeOldestFirst(buckets, tracked - stock);
}

function advanceAges(buckets: number[]): void {
  const last = WEAPON_AGE_MAX_MONTHS;
  buckets[last] += buckets[last - 1];
  for (let age = last - 1; age > 0; age--) buckets[age] = buckets[age - 1];
  buckets[0] = 0;
}

/** Weapons stolen this month from one market's stock of one good. */
export function getMonthlyTheft(buckets: readonly number[], unrest: number): number {
  if (!(unrest > 0)) return 0;
  const lootable = buckets.reduce((total, units, age) => total + units * getLootableAgeWeight(age), 0);
  return lootable * THEFT_MONTHLY_RATE_MAX * unrest;
}

function recordTheft(burg: Burg, goodName: string, units: number): void {
  burg.armsStolen = rn((burg.armsStolen ?? 0) + units, 4);
  burg.armsStolenByGood ??= {};
  const byGood = burg.armsStolenByGood;
  byGood[goodName] = rn((byGood[goodName] ?? 0) + units, 4);
}

function settleMarket(market: Market, weaponGoods: readonly { i: number; name: string }[]): void {
  const burg = getWorldContext().pack.burgs[market.centerBurgId];
  const unrest = burg && !burg.removed ? getTheftUnrest(burg) : 0;
  for (const good of weaponGoods) {
    const marketGood = market.goods[good.i];
    const stock = marketGood?.stock ?? 0;
    const ages = market.weaponStockAge?.[good.i];
    if (!ages && stock <= STOCK_EPSILON) continue;

    const buckets = ages ? [...ages] : emptyBuckets();
    syncAges(buckets, Math.max(0, stock));
    const stolen = marketGood && burg ? Math.min(rn(getMonthlyTheft(buckets, unrest), 4), marketGood.stock) : 0;
    if (stolen > STOCK_EPSILON && marketGood && burg) {
      takeOldestFirst(buckets, stolen);
      marketGood.stock = rn(Math.max(0, marketGood.stock - stolen), 4);
      recordGoodFlow({ direction: "sink", category: "theft", goodId: good.i, units: stolen, marketId: market.i });
      recordTheft(burg, good.name, stolen);
    }
    advanceAges(buckets);

    if (sum(buckets) <= STOCK_EPSILON) {
      if (market.weaponStockAge) delete market.weaponStockAge[good.i];
      continue;
    }
    market.weaponStockAge ??= {};
    market.weaponStockAge[good.i] = buckets.map(units => rn(units, 4));
  }
}

/** Runs once per production month, after the month's trade and demand have moved the stock. */
export function settleArmsTheft(): void {
  const weaponGoods = getGoods().filter(good => WEAPON_GOOD_NAMES.includes(good.name));
  if (!weaponGoods.length) return;
  for (const market of getMarkets()) {
    if (market) settleMarket(market, weaponGoods);
  }
}

/** Weapons stolen from the burgs of one State, for an uprising's risk. */
export function getArmsStolenInState(stateId: number): number {
  return rn(
    getWorldContext().pack.burgs.reduce(
      (total, burg) => (burg?.i && burg.state === stateId ? total + (burg.armsStolen ?? 0) : total),
      0
    ),
    4
  );
}
