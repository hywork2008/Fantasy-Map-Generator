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
 * With `fmg-long-distance-trade` on, a house also starts with factories in foreign capitals and
 * opens a branch where rumours of a lasting price gap reach it
 * (docs/plan/long-distance-merchant-reach-capital.md §4.3).
 */
import { getSliceArray, setSliceArray } from "../context/economyApi";
import { getApi, getMarkets, getWorldContext } from "../economyContext";

/** Months of price snapshots kept; letters older than this are no use. */
export const PRICE_HISTORY_MONTHS = 12;
/** Branches a house starts with besides its home market: the nearest markets it can reach. */
export const STARTING_BRANCHES = 3;
/** Factories (Kontore) a house starts with in foreign capitals, the nearest within its reach (§4.3). */
export const FOREIGN_FACTORIES = 2;
/** Days a price gap must be heard of before a house sends an agent there (§4.3). */
export const RUMOUR_BRANCH_DAYS = 180;
/** A rumour not heard again within this many days is forgotten: the gap did not last. */
const RUMOUR_LAPSE_DAYS = 45;

interface PriceSnapshot {
  tick: number;
  prices: Record<string, Record<string, number>>;
}
interface BranchRow {
  homeMarketId: number;
  marketIds: number[];
  /** Foreign factories have been placed (once per house, on a new map or the first load). */
  factoriesPlaced?: boolean;
}
/** A house has heard of a price gap with a market where it has no agent, since `since`. */
interface BranchRumour {
  homeMarketId: number;
  marketId: number;
  since: number;
  last: number;
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

/**
 * Gives every house without them up to FOREIGN_FACTORIES branches in the capitals of other states
 * within `maxDays` of its home, nearest first — the Hanse's Kontore at Bruges, London and
 * Novgorod (§4.3). States at war with the house's state are passed over.
 */
export function seedForeignFactories(daysBetween: (from: number, to: number) => number | null, maxDays: number): void {
  const rows = branches();
  if (rows.every(row => row.factoriesPlaced)) return;
  const { pack } = getWorldContext();
  const marketById = new Map(getMarkets().map(market => [market.i, market]));
  const capitals: { marketId: number; stateId: number }[] = [];
  for (const state of pack.states ?? []) {
    if (!state?.i || state.removed || !state.capital) continue;
    const marketId = pack.burgs[state.capital]?.market;
    if (marketId && marketById.has(marketId)) capitals.push({ marketId, stateId: state.i });
  }

  const next = rows.map(row => {
    if (row.factoriesPlaced) return row;
    const home = marketById.get(row.homeMarketId);
    const homeStateId = home ? (pack.burgs[home.centerBurgId]?.state ?? 0) : 0;
    const diplomacy = pack.states?.[homeStateId]?.diplomacy;
    const factories = capitals
      .filter(capital => capital.stateId !== homeStateId && !row.marketIds.includes(capital.marketId))
      .filter(capital => diplomacy?.[capital.stateId] !== "Enemy")
      .map(capital => ({ id: capital.marketId, days: daysBetween(row.homeMarketId, capital.marketId) }))
      .filter((entry): entry is { id: number; days: number } => entry.days !== null && entry.days <= maxDays)
      .sort((a, b) => a.days - b.days || a.id - b.id)
      .map(entry => entry.id)
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .slice(0, FOREIGN_FACTORIES);
    return { ...row, marketIds: [...row.marketIds, ...factories], factoriesPlaced: true };
  });
  setSliceArray("merchantBranches", next);
}

function rumours(): BranchRumour[] {
  return getSliceArray<BranchRumour>("merchantBranchRumours");
}

/**
 * A price gap between two markets that no house serves together. The house with an agent at one
 * end whose home lies nearest the other end (within `maxDays`) hears of it; once it has heard
 * of the gap for RUMOUR_BRANCH_DAYS without a lapse, it sends an agent there (§4.3).
 */
export function hearPriceGapRumour(
  marketA: number,
  marketB: number,
  daysBetween: (from: number, to: number) => number | null,
  maxDays: number
): void {
  let best: { homeMarketId: number; marketId: number; days: number } | null = null;
  for (const row of branches()) {
    const hasA = row.marketIds.includes(marketA);
    if (hasA === row.marketIds.includes(marketB)) continue;
    const marketId = hasA ? marketB : marketA;
    const days = daysBetween(row.homeMarketId, marketId);
    if (days === null || days > maxDays) continue;
    if (!best || days < best.days || (days === best.days && row.homeMarketId < best.homeMarketId))
      best = { homeMarketId: row.homeMarketId, marketId, days };
  }
  if (!best) return;

  const tick = now();
  const list = rumours();
  const rumour = list.find(entry => entry.homeMarketId === best.homeMarketId && entry.marketId === best.marketId);
  if (!rumour) {
    setSliceArray("merchantBranchRumours", [
      ...list,
      { homeMarketId: best.homeMarketId, marketId: best.marketId, since: tick, last: tick }
    ]);
    return;
  }
  if (tick - rumour.last > RUMOUR_LAPSE_DAYS) rumour.since = tick;
  rumour.last = tick;
  if (tick - rumour.since < RUMOUR_BRANCH_DAYS) return;
  openBranch(best.homeMarketId, best.marketId);
  setSliceArray(
    "merchantBranchRumours",
    list.filter(entry => entry !== rumour)
  );
}

/** Drops rumours of gaps that closed (not heard again within RUMOUR_LAPSE_DAYS). */
export function forgetLapsedRumours(): void {
  const list = rumours();
  if (!list.length) return;
  const tick = now();
  const kept = list.filter(entry => tick - entry.last <= RUMOUR_LAPSE_DAYS);
  if (kept.length !== list.length) setSliceArray("merchantBranchRumours", kept);
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
    branches: Object.fromEntries(branches().map(row => [row.homeMarketId, row.marketIds.length])),
    rumours: rumours().length
  };
}
