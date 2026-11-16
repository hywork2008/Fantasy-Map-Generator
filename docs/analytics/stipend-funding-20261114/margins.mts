/**
 * Guild masters' workshop base (docs/analytics/stipend-funding-20261114.md §6): each month, the craft
 * margin (after-tax revenue less ingredient cost) of each Burg+domain whose guild has a master,
 * read from the guild's 35% share, against the master's living cost.
 *   npx tsx docs/analytics/stipend-funding-20261114/margins.mts <map.fmg> <months>
 */
import { readFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getSimulationCharacters as getCharacters } from "../../../src/extensions/characters/charactersContext";
import { getGuildKnowledgeStocks } from "../../../src/extensions/economy/context/knowledge";
import { findMaster } from "../../../src/extensions/economy/generators/guildSuccession";
import { computeLivingCost } from "../../../src/extensions/economy/generators/characterLivingCosts";
import { GUILD_PROFIT_SHARE, GuildTreasury } from "../../../src/extensions/economy/generators/guildTreasury";

const [input, monthsArg] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
let credits = new Map<string, number>();
const original = GuildTreasury.creditGuildTreasury.bind(GuildTreasury);
(GuildTreasury as { creditGuildTreasury: typeof original }).creditGuildTreasury = (burgId, domain, amount) => {
  const key = `${burgId}:${domain}`;
  credits.set(key, (credits.get(key) ?? 0) + amount);
  return original(burgId, domain, amount);
};
for (let month = 1; month <= Number(monthsArg ?? 3); month++) {
  credits = new Map();
  await advanceWorld(host, { months: 1 });
  const characters = getCharacters();
  const rows: [number, number][] = [];
  let allMargin = 0;
  for (const [, v] of credits) allMargin += v / GUILD_PROFIT_SHARE;
  for (const entry of getGuildKnowledgeStocks()) {
    const master = findMaster(characters, entry.burgId, entry.domain);
    if (!master) continue;
    rows.push([(credits.get(`${entry.burgId}:${entry.domain}`) ?? 0) / GUILD_PROFIT_SHARE, computeLivingCost(master)]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  const q = (p: number) => rows[Math.floor(p * (rows.length - 1))]?.[0].toFixed(2);
  const covered = rows.filter(([m, l]) => m >= l).length;
  console.log(`month ${month}: masters ${rows.length}, margin p10 ${q(0.1)} p50 ${q(0.5)} p90 ${q(0.9)} max ${q(1)}, sum ${rows.reduce((s, r) => s + r[0], 0).toFixed(0)} of all ${allMargin.toFixed(0)}, living p50 ${rows[Math.floor(rows.length / 2)]?.[1]}, margin >= living ${covered}`);
}
process.exit(0);
