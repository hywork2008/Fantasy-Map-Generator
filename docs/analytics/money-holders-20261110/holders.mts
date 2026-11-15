/**
 * Money by holder (docs/analytics/money-holders-20261110.md). Read-only: at the end of every month,
 * the cash of each holder the State money stock counts (stateMoneySupply.ts), one value per holder,
 * and the debts that are not cash (the markets' farmgate IOU and the towns' book credit). Barilla is
 * seeded as in barillaflow.mts (docs/analytics/barilla-20261108.md) so the runs match its maps.
 *
 *   npx tsx docs/analytics/money-holders-20261110/holders.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import Alea from "alea";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getBurgMarketLedgers, getGoods, getMarkets } from "../../../src/extensions/economy/context/trade";
import { getGoodCellColumn } from "../../../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getSimulationMonth } from "../../../src/extensions/economy/economyContext";
import { getGuildChapters, getGuildKnowledgeStocks } from "../../../src/extensions/economy/context/knowledge";
import { Goods } from "../../../src/extensions/economy/generators/goods-generator";
import { getTradeCapitalMoney } from "../../../src/extensions/economy/generators/merchantTradeCapital";
import { getCraftCreditOwed } from "../../../src/extensions/economy/generators/craftCredit";
import { readPersonalCash } from "../../../src/extensions/economy/generators/personalCash";
import { poolBalance } from "../../../src/extensions/economy/generators/personalCashLedger";
import {
  getSimulationCharacters,
  hasCharactersContext
} from "../../../src/extensions/characters/charactersContext";

const [input, output, monthsArg] = process.argv.slice(2);
const months = Number(monthsArg ?? 12);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const world = getWorldContext();
const { pack } = world;
const ruleHolds = (rule: string, cellId: number) => {
  const methods = Goods.getMethods(cellId);
  return Boolean(new Function(`{${Object.keys(methods).join(", ")}}`, `return ${rule}`)(methods));
};
const barilla = getGoods().find(good => good.name === "Barilla");
if (barilla?.distribution && barilla.chance) {
  const goodColumn = getGoodCellColumn();
  const random = Alea(`barilla-${world.seed}`);
  const cap = Math.ceil((200 * pack.cells.i.length) / 5000);
  let placed = 0;
  for (const cellId of pack.cells.i) {
    if (pack.cells.h[cellId] < 20 || goodColumn[cellId] === barilla.i) continue;
    if (!ruleHolds(barilla.distribution, cellId)) continue;
    if (goodColumn[cellId] || placed >= cap || random() * 100 > barilla.chance) continue;
    goodColumn[cellId] = barilla.i;
    placed++;
  }
}

const r2 = (value: number | undefined) => Math.round((Number(value) || 0) * 100) / 100;
type Holders = Record<string, Record<string, number>>;

function readHolders(): { holders: Holders; aggregate: Record<string, number>; people: Record<string, number> } {
  const holders: Holders = {
    stateTreasury: {},
    stateHouseholdPurse: {},
    stateDepartments: {},
    townTreasury: {},
    townHouseholds: {},
    guilds: {},
    marketCash: {},
    marketEscrow: {},
    merchantCapital: {},
    ruralHouseholds: {},
    characters: {},
    marketFarmgateOwed: {},
    townCraftCreditOwed: {}
  };
  const people: Record<string, number> = {};
  for (const state of pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    holders.stateTreasury[state.i] = r2(state.treasury);
    holders.stateHouseholdPurse[state.i] = r2(state.householdPurse);
    holders.stateDepartments[state.i] = r2(
      Object.values(state.departmentBalances ?? {}).reduce<number>((sum, value) => sum + (Number(value) || 0), 0)
    );
  }
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed) continue;
    holders.townTreasury[burg.i] = r2(burg.treasury);
    holders.townCraftCreditOwed[burg.i] = r2(getCraftCreditOwed(burg.i));
    people[`town:${burg.i}`] = r2(burg.population);
  }
  for (const ledger of getBurgMarketLedgers()) holders.townHouseholds[ledger.burgId] = r2(ledger.householdWealth);
  for (const guild of getGuildKnowledgeStocks())
    holders.guilds[`k${guild.burgId}:${(guild as { domain?: string }).domain ?? ""}`] = r2(guild.treasury);
  for (const chapter of getGuildChapters() as { id?: string | number; burgId?: number; treasury?: number }[])
    if (chapter.burgId) holders.guilds[`c${chapter.burgId}:${chapter.id ?? ""}`] = r2(chapter.treasury);
  for (const market of getMarkets()) {
    if (!market) continue;
    const treasury = market.marketTreasury;
    holders.marketCash[market.i] = r2(treasury?.balance);
    holders.marketEscrow[market.i] = r2(treasury?.tradeEscrow);
    holders.merchantCapital[market.i] = r2(getTradeCapitalMoney(treasury));
    holders.ruralHouseholds[market.i] = r2(market.foodLedger?.ruralHouseholdWealth);
    holders.marketFarmgateOwed[market.i] = r2(treasury?.ruralGrainPayable);
  }
  if (hasCharactersContext())
    for (const character of getSimulationCharacters())
      if (!character.cashAccountId) holders.characters[character.i] = r2(character.wealth);
  const aggregate: Record<string, number> = { personalAccounts: 0, personalPools: 0 };
  const cash = readPersonalCash();
  if (cash) {
    for (const account of Object.values(cash.accounts)) aggregate.personalAccounts += account.balance / 100;
    for (const pool of Object.values(cash.pools)) aggregate.personalPools += poolBalance(pool) / 100;
  }
  aggregate.personalAccounts = r2(aggregate.personalAccounts);
  aggregate.personalPools = r2(aggregate.personalPools);
  return { holders, aggregate, people };
}

const snapshots = [];
const start = readHolders();
snapshots.push({ month: 0, calendarMonth: getSimulationMonth(), ...start });
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  const { holders, aggregate } = readHolders();
  snapshots.push({ month, calendarMonth: getSimulationMonth(), holders, aggregate });
  writeFileSync(output, JSON.stringify({ input, snapshots }));
  console.log(`[holders] ${input} month ${month}`);
}
process.exit(0);
