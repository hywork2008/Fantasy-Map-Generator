/**
 * World money by holder, month by month (as stateMoneySupply.ts counts a State's money): state
 * treasury, state purse and departments, town treasuries, town households, guilds, market cash,
 * market trade capital and escrow, rural purses, and the rest (characters and personal cash) as
 * total minus those. ROOT=<repo> picks the code.
 * Usage: moneyholders.mts <archive.fmg> <output.jsonl> [months]
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const R = process.env.ROOT ?? "/Users/h-yamaguchi/Projects/fmg-2";
const ctx = await import(`${R}/src/extensions/economy/economyContext`);
const { getStateMoneyStocks, getUnassignedPersonalCash } = await import(`${R}/src/extensions/economy/generators/stateMoneySupply`);
const { getTradeCapitalMoney } = await import(`${R}/src/extensions/economy/generators/merchantTradeCapital`);
const { advanceWorld, createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`${R}/scripts/lib/conflictAutonomyFromEnv.mts`);
const [input, output, length = "84"] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
writeFileSync(output, "");
const p = (v: unknown) => (Number.isFinite(v) && (v as number) > 0 ? (v as number) : 0);
for (let m = 1; m <= Number(length); m++) {
  await advanceWorld(host, { months: 1 });
  const { pack } = ctx.getWorldContext();
  const row: Record<string, number> = { month: m };
  const live = (pack.states ?? []).filter((s: any) => s?.i && !s.removed);
  row.stateTreasury = live.reduce((s: number, st: any) => s + p(st.treasury), 0);
  row.statePurse = live.reduce((s: number, st: any) => s + p(st.householdPurse) + Object.values(st.departmentBalances ?? {}).reduce((a: number, v: any) => a + p(Number(v)), 0), 0);
  row.townTreasury = (pack.burgs ?? []).filter((b: any) => b?.i && !b.removed).reduce((s: number, b: any) => s + p(b.treasury), 0);
  row.townHouseholds = ctx.getBurgMarketLedgers().reduce((s: number, l: any) => s + p(l.householdWealth), 0);
  row.guilds = ctx.getGuildKnowledgeStocks().reduce((s: number, g: any) => s + p(g.treasury), 0) + (ctx.getGuildChapters() as any[]).reduce((s: number, g: any) => s + p(g.treasury), 0);
  row.marketCash = ctx.getMarkets().reduce((s: number, mk: any) => s + p(mk.marketTreasury?.balance), 0);
  row.marketTradeCapital = ctx.getMarkets().reduce((s: number, mk: any) => s + p(mk.marketTreasury?.tradeEscrow) + getTradeCapitalMoney(mk.marketTreasury), 0);
  row.ruralPurse = ctx.getMarkets().reduce((s: number, mk: any) => s + p(mk.foodLedger?.ruralHouseholdWealth), 0);
  row.grainIou = ctx.getMarkets().reduce((s: number, mk: any) => s + p(mk.marketTreasury?.ruralGrainPayable), 0);
  let total = getUnassignedPersonalCash();
  for (const stock of getStateMoneyStocks().values()) total += stock.money;
  row.total = total;
  row.peopleAndOther = total - ["stateTreasury", "statePurse", "townTreasury", "townHouseholds", "guilds", "marketCash", "marketTradeCapital", "ruralPurse"].reduce((s, k) => s + row[k], 0);
  for (const k of Object.keys(row)) row[k] = Math.round(row[k]);
  appendFileSync(output, `${JSON.stringify(row)}\n`);
  console.log("month", m);
}
host.dispose();
