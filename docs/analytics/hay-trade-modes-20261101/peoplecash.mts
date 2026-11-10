/**
 * Money held by people, month by month: abstract roster pools and managed accounts (Private cash),
 * market merchants' Character.wealth against the reserve they keep before spending, and other
 * characters. Usage: peoplecash.mts <archive.fmg> <output.jsonl> [months]
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const R = process.env.ROOT ?? "/Users/h-yamaguchi/Projects/fmg-2";
const ctx = await import(`${R}/src/extensions/economy/economyContext`);
const pc = { ...(await import(`${R}/src/extensions/economy/generators/personalCash`)), ...(await import(`${R}/src/extensions/economy/generators/personalCashLedger`)) };
const lc = await import(`${R}/src/extensions/economy/generators/characterLivingCosts`);
const chars = await import(`${R}/src/extensions/characters/charactersContext`);
const { advanceWorld, createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const { applyConflictAutonomyFromEnv } = await import(`${R}/scripts/lib/conflictAutonomyFromEnv.mts`);
const [input, output, length = "84"] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
writeFileSync(output, "");
const r2 = (v: number) => Math.round(v * 100) / 100;
for (let m = 0; m <= Number(length); m++) {
  if (m) await advanceWorld(host, { months: 1 });
  const s = pc.readPersonalCash();
  const pools = Object.values(s?.pools ?? {}) as any[];
  const accounts = Object.values(s?.accounts ?? {}) as any[];
  const merchants = new Set<number>();
  for (const mk of ctx.getMarkets()) for (const id of [mk.managerCharacterId, ...(mk.rivalCharacterIds ?? [])]) if (typeof id === "number") merchants.add(id);
  let mW = 0, mReserve = 0, mN = 0, oW = 0, oN = 0;
  for (const c of chars.hasCharactersContext() ? chars.getSimulationCharacters() : []) {
    if (!c || c.dead) continue;
    if (merchants.has(c.i)) { mN++; mW += c.wealth || 0; mReserve += lc.computeLivingCost(c) * 61; }
    else if ((c.wealth || 0) > 0) { oN++; oW += c.wealth || 0; }
  }
  const row = {
    month: m,
    privateCash: r2(pc.personalCashTotal()),
    pools: pools.length,
    poolCash: r2(pools.reduce((a, p) => a + pc.poolBalance(p), 0) / 100),
    accounts: accounts.length,
    accountCash: r2(accounts.reduce((a, x) => a + x.balance, 0) / 100),
    merchants: mN, merchantWealth: r2(mW), merchantReserve: r2(mReserve),
    otherCharacters: oN, otherWealth: r2(oW),
    marketCash: r2(ctx.getMarkets().reduce((a: number, mk: any) => a + Math.max(0, mk.marketTreasury?.balance || 0), 0)),
  };
  appendFileSync(output, `${JSON.stringify(row)}\n`);
  console.log("month", m);
}
host.dispose();
