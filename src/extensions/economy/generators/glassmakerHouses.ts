/**
 * Glassmaker houses (docs/plan/forest-glasshouses.md §3.5). The craft of the forest glasshouse was
 * handed down inside the glassmaker families (Spessart 1406, Altare); a forest without such a
 * family made no glass. Families grew by their sons founding new huts, and moved, whole houses at a
 * time, to the lords and kings who invited them (Lorraine to England 1567, Saxony to Bohemia).
 * A state that held much of the craft forbade its glassmakers to leave, as Venice did.
 *
 * `houses` counts huts' worth of master families. Once a year each market's houses grow toward the
 * glass its huts could not make for want of families, idle houses leave, and the leavers settle
 * where families are wanted: in their own state first, then abroad unless their state forbids it.
 */

import { rn } from "../../hostUtils";

/** Share of a market's houses whose sons found a new hut in a year: one per generation of ~25 years (provisional). */
export const GLASSMAKER_HOUSE_GROWTH_PER_YEAR = 0.04;
/** Share of idle houses that leave their market in a year, to move or give up the craft (provisional). */
export const GLASSMAKER_IDLE_LEAVE_PER_YEAR = 0.25;
/** A state holding at least this share of all glassmaker houses forbids its glassmakers to leave (provisional). */
export const GLASSMAKER_EMIGRATION_BAN_SHARE = 0.2;
/**
 * Months after the start in which the huts work as the forest allows, and the market's glass use is
 * watched to seed the houses. A year, as a market's use of glass climbs for months after the start.
 */
export const GLASSMAKER_FOUNDING_MONTHS = 12;
/** Houses kept over the glass the market uses, for the months its use runs high (provisional). */
export const GLASSMAKER_HOUSE_MARGIN = 1.25;
const MIN_HOUSES = 0.01;

/** Houses a market starts with: enough for its highest monthly glass use in the founding months, with a margin. */
export function getFoundingHouses(monthlyDraw: number, lotsPerHutYear: number, forestHuts: number): number {
  if (!(monthlyDraw > 0) || !(lotsPerHutYear > 0)) return 0;
  return rn(Math.min(Math.max(0, forestHuts), ((monthlyDraw * 12) / lotsPerHutYear) * GLASSMAKER_HOUSE_MARGIN), 4);
}

export interface GlassmakerMarketYear {
  marketId: number;
  stateId: number;
  houses: number;
  /** Huts' worth of glass made in the year. */
  usedHuts: number;
  /** Huts' worth of glass wanted but not made for want of houses. */
  shortHuts: number;
  /** Huts the market's forest and its people could hold. */
  forestHuts: number;
}

export interface GlassmakerMarketResult {
  marketId: number;
  houses: number;
  grown: number;
  left: number;
  arrived: number;
}

export interface GlassmakerYearResult {
  markets: GlassmakerMarketResult[];
  /** States that forbade their glassmakers to leave this year. */
  banningStates: number[];
  /** Leavers no market took, who gave up the craft. */
  lost: number;
}

/** One year of growth, departures and settlement of the glassmaker houses of every market. */
export function settleGlassmakerYear(rows: readonly GlassmakerMarketYear[]): GlassmakerYearResult {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.houses), 0);
  const byState = new Map<number, number>();
  for (const row of rows) byState.set(row.stateId, (byState.get(row.stateId) ?? 0) + Math.max(0, row.houses));
  const banning = new Set<number>();
  if (total > 0)
    for (const [stateId, houses] of byState)
      if (stateId && houses / total >= GLASSMAKER_EMIGRATION_BAN_SHARE) banning.add(stateId);

  const results = new Map<number, GlassmakerMarketResult>();
  const wanted = new Map<number, number>();
  const leavers = new Map<number, number>();
  for (const row of rows) {
    const houses = Math.max(0, row.houses);
    const used = Math.min(houses, Math.max(0, row.usedHuts), Math.max(0, row.forestHuts));
    let short = Math.max(0, row.shortHuts);
    const grown = Math.min(short, houses * GLASSMAKER_HOUSE_GROWTH_PER_YEAR, Math.max(0, row.forestHuts - houses));
    short -= grown;
    const left = Math.max(0, houses - used) * GLASSMAKER_IDLE_LEAVE_PER_YEAR;
    if (left > 0) leavers.set(row.stateId, (leavers.get(row.stateId) ?? 0) + left);
    results.set(row.marketId, { marketId: row.marketId, houses: houses + grown - left, grown, left, arrived: 0 });
    const room = Math.max(0, row.forestHuts - (houses + grown - left));
    if (short > 0 && room > 0) wanted.set(row.marketId, Math.min(short, room));
  }

  // Families wanted most are invited first; their own state's leavers come before foreigners.
  const stateOf = new Map(rows.map(row => [row.marketId, row.stateId]));
  const order = [...wanted.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (const [marketId, need] of order) {
    let left = need;
    const stateId = stateOf.get(marketId) ?? 0;
    const take = (from: number) => {
      const moved = Math.min(left, leavers.get(from) ?? 0);
      leavers.set(from, (leavers.get(from) ?? 0) - moved);
      left -= moved;
    };
    take(stateId);
    for (const from of [...leavers.keys()].sort((a, b) => a - b))
      if (left > 0 && from !== stateId && !banning.has(from)) take(from);
    const result = results.get(marketId)!;
    result.arrived = need - left;
    result.houses += result.arrived;
  }
  // Leavers of a state that forbids leaving and found no place at home stay where they were, idle.
  for (const [stateId, houses] of leavers) {
    if (!(houses > 0) || !banning.has(stateId)) continue;
    const home = rows.map(row => results.get(row.marketId)!).filter((_, k) => rows[k].stateId === stateId);
    const idle = home.reduce((sum, result) => sum + result.left, 0);
    if (!(idle > 0)) continue;
    for (const result of home) {
      const back = (houses * result.left) / idle;
      result.houses += back;
      result.left -= back;
    }
    leavers.set(stateId, 0);
  }
  let lost = 0;
  for (const houses of leavers.values()) lost += houses;
  for (const result of results.values()) {
    result.houses = result.houses < MIN_HOUSES ? 0 : rn(result.houses, 4);
    result.grown = rn(result.grown, 4);
    result.left = rn(result.left, 4);
    result.arrived = rn(result.arrived, 4);
  }
  return { markets: [...results.values()], banningStates: [...banning].sort((a, b) => a - b), lost: rn(lost, 4) };
}
