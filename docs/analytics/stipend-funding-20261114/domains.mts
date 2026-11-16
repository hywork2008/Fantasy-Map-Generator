/**
 * Craft margin by guild domain (docs/analytics/stipend-funding-20261114.md §8): months 2-3 of 2103,
 * each Burg+domain's monthly margin (the guild's 35% share / 0.35), and how many Burg+domains
 * reach a master's living cost (7.6 a month) at a given share of their margin.
 *   npx tsx docs/analytics/stipend-funding-20261114/domains.mts <map.fmg>
 */
import { readFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { GUILD_PROFIT_SHARE, GuildTreasury } from "../../../src/extensions/economy/generators/guildTreasury";

const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare();
await advanceWorld(host, { months: 1 });
const credits = new Map<string, number>();
const original = GuildTreasury.creditGuildTreasury.bind(GuildTreasury);
(GuildTreasury as { creditGuildTreasury: typeof original }).creditGuildTreasury = (burgId, domain, amount) => {
  credits.set(`${burgId}:${domain}`, (credits.get(`${burgId}:${domain}`) ?? 0) + amount / GUILD_PROFIT_SHARE);
  return original(burgId, domain, amount);
};
await advanceWorld(host, { months: 2 });
const byDomain = new Map<string, number[]>();
for (const [key, margin] of credits) {
  const domain = key.split(":")[1];
  (byDomain.get(domain) ?? byDomain.set(domain, []).get(domain)!).push(margin / 2);
}
const LIVING = 7.6;
console.log("domain burgs sumMargin p50 p90 max reach@30% reach@50% reach@100%");
for (const [domain, list] of [...byDomain].sort((a, b) => b[1].reduce((s, v) => s + v, 0) - a[1].reduce((s, v) => s + v, 0))) {
  list.sort((a, b) => a - b);
  const q = (p: number) => list[Math.floor(p * (list.length - 1))].toFixed(1);
  const reach = (share: number) => list.filter(m => m * share >= LIVING).length;
  console.log([domain, list.length, list.reduce((s, v) => s + v, 0).toFixed(0), q(0.5), q(0.9), q(1), reach(0.3), reach(0.5), reach(1)].join(" "));
}
process.exit(0);
