/**
 * The money a State actually holds (docs/plan/money-supply-mint.md §4.1): every cash stock held by
 * its government, towns, markets, households and people, counted where the holder lives. The mint
 * and the price level read this instead of a separate circulation figure, and the treasury reserve
 * is capped against it. Read-only.
 *
 * Holders: State treasury, household purse and department balances; town treasuries, town
 * household wallets and guild treasuries (by the town's state); market cash and merchant working
 * capital (by the market's centre town); rural household wallets (split by political ownership of
 * the market's farm cells); characters' wealth (by their state). A market's unpaid farmgate IOU
 * (`ruralGrainPayable`) is a debt, not cash, and the credit pool is a lending limit, not cash.
 */

import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import {
  getBurgMarketLedgers,
  getGuildChapters,
  getGuildKnowledgeStocks,
  getMarketCellColumn,
  getMarkets,
  getWorldContext,
  isEconomyContextReady
} from "../economyContext";
import { getTradeCapitalMoney } from "./merchantTradeCapital";

export interface StateMoneyStock {
  stateId: number;
  /** Live population points: rural cells owned by the State plus its towns. */
  population: number;
  urbanPopulation: number;
  /** All cash held inside the State. */
  money: number;
  /** The State treasury's part of `money`. */
  treasury: number;
}

const positive = (value: number | undefined) =>
  Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;

/** Every live State's money stock, by state id. Empty without an Economy context. */
export function getStateMoneyStocks(): Map<number, StateMoneyStock> {
  const stocks = new Map<number, StateMoneyStock>();
  if (!isEconomyContextReady()) return stocks;
  const { pack } = getWorldContext();
  for (const state of pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    const departments = Object.values(state.departmentBalances ?? {}).reduce<number>(
      (sum, value) => sum + positive(Number(value)),
      0
    );
    const treasury = positive(state.treasury);
    stocks.set(state.i, {
      stateId: state.i,
      population: 0,
      urbanPopulation: 0,
      money: treasury + positive(state.householdPurse) + departments,
      treasury
    });
  }
  const add = (stateId: number | undefined, amount: number) => {
    const stock = stateId ? stocks.get(stateId) : undefined;
    if (stock && amount > 0) stock.money += amount;
  };

  const burgState = new Map<number, number>();
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    burgState.set(burg.i, burg.state ?? 0);
    const stock = stocks.get(burg.state ?? 0);
    if (!stock) continue;
    stock.population += positive(burg.population);
    stock.urbanPopulation += positive(burg.population);
    stock.money += positive(burg.treasury);
  }
  for (const ledger of getBurgMarketLedgers()) add(burgState.get(ledger.burgId), positive(ledger.householdWealth));
  for (const guild of getGuildKnowledgeStocks()) add(burgState.get(guild.burgId), positive(guild.treasury));
  for (const chapter of getGuildChapters() as { burgId?: number; treasury?: number }[])
    if (chapter.burgId) add(burgState.get(chapter.burgId), positive(chapter.treasury));

  // Rural population by (market, state), so a market's farm purse is split by who owns its fields.
  const ruralByMarket = new Map<number, Map<number, number>>();
  const cells = pack.cells;
  if (cells?.i) {
    const column = getMarketCellColumn();
    for (const cellId of cells.i) {
      if (cells.h[cellId] < 20) continue;
      const pop = positive(cells.pop[cellId]);
      if (!pop) continue;
      const stateId = cells.state?.[cellId] ?? 0;
      const stock = stocks.get(stateId);
      if (stock) stock.population += pop;
      const marketId = column[cellId] ?? 0;
      if (!marketId) continue;
      const byState = ruralByMarket.get(marketId) ?? new Map<number, number>();
      byState.set(stateId, (byState.get(stateId) ?? 0) + pop);
      ruralByMarket.set(marketId, byState);
    }
  }

  for (const market of getMarkets()) {
    if (!market) continue;
    const treasury = market.marketTreasury;
    add(burgState.get(market.centerBurgId), positive(treasury?.balance) + getTradeCapitalMoney(treasury));
    const purse = positive(market.foodLedger?.ruralHouseholdWealth);
    const byState = ruralByMarket.get(market.i);
    if (!purse || !byState) continue;
    const total = [...byState.values()].reduce((sum, pop) => sum + pop, 0);
    if (total > 0) for (const [stateId, pop] of byState) add(stateId, (purse * pop) / total);
  }

  if (hasCharactersContext())
    for (const character of getCharacters()) if (!character.dead) add(character.state, positive(character.wealth));

  return stocks;
}

/** One State's money stock; undefined for a removed State or without an Economy context. */
export function getStateMoneyStock(stateId: number): StateMoneyStock | undefined {
  return getStateMoneyStocks().get(stateId);
}
