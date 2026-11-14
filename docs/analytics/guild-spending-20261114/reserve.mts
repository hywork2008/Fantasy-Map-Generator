/**
 * Guild reserve check (docs/analytics/guild-spending-20261114.md §3): after one month, the number of
 * guild treasuries, the working reserve (FMG_GUILD_RESERVE_MONTHS months of stipend, or the setting) and how much of their money lies above it.
 *
 *   npx tsx docs/analytics/guild-spending-20261114/reserve.mts <map.fmg>
 */
import { readFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getGuildKnowledgeStocks } from "../../../src/extensions/economy/context/knowledge";
import { GUILD_MASTER_STIPEND } from "../../../src/extensions/economy/generators/characterStipends";
import { getMarketSettings } from "../../../src/simulation/marketSettings";
import { nominal } from "../../../src/extensions/economy/generators/moneyScale";

const [input] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
await advanceWorld(host, { months: 1 });
const reserve = nominal(GUILD_MASTER_STIPEND) * Number(process.env.FMG_GUILD_RESERVE_MONTHS ?? getMarketSettings().guildReserveMonths);
const guilds = getGuildKnowledgeStocks();
const treasuries = guilds.map(guild => guild.treasury ?? 0).sort((a, b) => b - a);
const total = treasuries.reduce((sum, value) => sum + value, 0);
const above = treasuries.reduce((sum, value) => sum + Math.max(0, value - reserve), 0);
console.log(
  JSON.stringify({
    guilds: guilds.length,
    withMoney: treasuries.filter(value => value > 0).length,
    reserve: Math.round(reserve * 100) / 100,
    total: Math.round(total),
    above: Math.round(above),
    overReserve: treasuries.filter(value => value > reserve).length,
    top: treasuries.slice(0, 5).map(Math.round)
  })
);
process.exit(0);
