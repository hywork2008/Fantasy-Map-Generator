/**
 * What merchants know about distant markets (docs/plan/initial-wealth-calibration.md §9).
 *
 * A medieval trading house learned prices from its own branch agents' letters, which took as long
 * to arrive as a journey. So a merchant organization:
 * - sees its home market's prices now;
 * - sees a branch market's prices as they were `travel days` ago (the last letter that reached home);
 * - knows nothing of a market where it has no branch, and cannot trade there.
 * Branches are abstract agents (one resident of the town), not Characters. A house opens one
 * where its caravan arrives. Monthly price snapshots stand in for the letters.
 */
import { getSliceArray, setSliceArray } from "../context/economyApi";
import { getApi, getMarkets } from "../economyContext";

/** Months of price snapshots kept; letters older than this are no use. */
export const PRICE_HISTORY_MONTHS = 12;
/** Branches a house starts with besides its home market: the nearest markets it can reach. */
export const STARTING_BRANCHES = 3;

interface PriceSnapshot {
  tick: number;
  prices: Record<string, Record<string, number>>;
}
interface BranchRow {
  homeMarketId: number;
  marketIds: number[];
}

const now = () => Math.max(0, Math.floor(getApi().simulationContext?.tickCount ?? 0));

/** Records this month's prices in every market. Call once per production cycle, before trade. */
export function recordMarketPriceSnapshot(): void {
  const history = getSliceArray<PriceSnapshot>("marketPriceHistory").slice();
  const tick = now();
  if (history.length && history[history.length - 1].tick === tick) return;
  const prices: PriceSnapshot["prices"] = {};
  for (const market of getMarkets()) {
    const row: Record<string, number> = {};
    for (const [goodId, good] of Object.entries(market.goods)) if (good.price > 0) row[goodId] = good.price;
    prices[market.i] = row;
  }
  history.push({ tick, prices });
  while (history.length > PRICE_HISTORY_MONTHS) history.shift();
  setSliceArray("marketPriceHistory", history);
}

function branches(): BranchRow[] {
  return getSliceArray<BranchRow>("merchantBranches");
}

/**
 * Gives every market's house its home plus the nearest markets within `maxDays`, once. Later calls
 * leave existing branch lists alone (they grow through `openBranch`).
 */
export function seedMerchantBranches(daysBetween: (from: number, to: number) => number | null, maxDays: number): void {
  const rows = branches().slice();
  const known = new Set(rows.map(row => row.homeMarketId));
  const markets = getMarkets();
  let changed = false;
  for (const home of markets) {
    if (known.has(home.i)) continue;
    const near = markets
      .filter(other => other.i !== home.i)
      .map(other => ({ id: other.i, days: daysBetween(home.i, other.i) }))
      .filter((entry): entry is { id: number; days: number } => entry.days !== null && entry.days <= maxDays)
      .sort((a, b) => a.days - b.days || a.id - b.id)
      .slice(0, STARTING_BRANCHES)
      .map(entry => entry.id);
    rows.push({ homeMarketId: home.i, marketIds: [home.i, ...near] });
    changed = true;
  }
  if (changed) setSliceArray("merchantBranches", rows);
}

/** A house's caravan reached `marketId`: from now on it keeps an agent there. */
export function openBranch(homeMarketId: number, marketId: number): void {
  const rows = branches();
  const row = rows.find(entry => entry.homeMarketId === homeMarketId);
  if (!row) {
    setSliceArray("merchantBranches", [...rows, { homeMarketId, marketIds: [homeMarketId, marketId] }]);
    return;
  }
  if (!row.marketIds.includes(marketId)) row.marketIds.push(marketId);
}

/** Homes of the houses with an agent in both markets: the only ones that could trade between them. */
export function housesPresentIn(marketA: number, marketB: number): number[] {
  return branches()
    .filter(row => row.marketIds.includes(marketA) && row.marketIds.includes(marketB))
    .map(row => row.homeMarketId);
}

/**
 * The price of `goodId` in `marketId` as the house at `homeMarketId` knows it: current at home,
 * otherwise the newest snapshot at least `travelDays` old (the oldest kept, early in a game).
 */
export function knownPrice(
  homeMarketId: number,
  marketId: number,
  goodId: number,
  travelDays: number,
  currentPrice: number
): number {
  if (homeMarketId === marketId || !(travelDays > 0)) return currentPrice;
  const history = getSliceArray<PriceSnapshot>("marketPriceHistory");
  if (!history.length) return currentPrice;
  const cutoff = now() - travelDays;
  let chosen = history[0];
  for (const snapshot of history) if (snapshot.tick <= cutoff) chosen = snapshot;
  return chosen.prices[marketId]?.[goodId] ?? currentPrice;
}

/** For diagnostics: months of history kept and the branch count of each house. */
export function merchantIntelligenceSummary() {
  return {
    snapshots: getSliceArray<PriceSnapshot>("marketPriceHistory").length,
    branches: Object.fromEntries(branches().map(row => [row.homeMarketId, row.marketIds.length]))
  };
}
