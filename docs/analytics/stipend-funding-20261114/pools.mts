/**
 * Stipend funding (docs/analytics/stipend-funding-20261114.md): each month, for rulers, central
 * officers and guild masters, the stipend they are due, what their paying pool holds after the
 * month, their living cost and their wealth.
 *   npx tsx docs/analytics/stipend-funding-20261114/pools.mts <map.fmg> <out.json> <months>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import { getSimulationCharacters as getCharacters } from "../../../src/extensions/characters/charactersContext";
import { getGuildKnowledgeStocks } from "../../../src/extensions/economy/context/knowledge";
import { getRulerId } from "../../../src/extensions/nobility/nobilityContext";
import { CENTRAL_OFFICES } from "../../../src/extensions/nobility/data/titleTable";
import { findMaster } from "../../../src/extensions/economy/generators/guildSuccession";
import { computeLivingCost } from "../../../src/extensions/economy/generators/characterLivingCosts";
import { GUILD_MASTER_STIPEND } from "../../../src/extensions/economy/generators/characterStipends";
import { nominal } from "../../../src/extensions/economy/generators/moneyScale";
import { DEPARTMENT_BY_PRIMARY_SKILL, findLivingOfficeHolder } from "../../../src/extensions/economy/generators/treasuryAllocation";

const [input, output, monthsArg] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
const { pack } = getWorldContext();
const r2 = (v: number) => Math.round(v * 100) / 100;
type Row = { n: number; wealth: number; living: number; pool: number; poolBelowDue: number; due: number };
const blank = (): Row => ({ n: 0, wealth: 0, living: 0, pool: 0, poolBelowDue: 0, due: 0 });
function snapshot() {
  const characters = getCharacters();
  const rulers = blank(), offices = blank(), masters = blank();
  for (const state of pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    const ruler = characters.find(c => c.i === getRulerId(state) && !c.dead);
    if (ruler) {
      rulers.n++; rulers.wealth += ruler.wealth ?? 0; rulers.living += computeLivingCost(ruler);
      rulers.pool += state.householdPurse ?? 0; rulers.due += state.treasury ?? 0;
    }
    for (const office of CENTRAL_OFFICES) {
      const key = office.primarySkill && DEPARTMENT_BY_PRIMARY_SKILL[office.primarySkill];
      if (!key) continue;
      const holder = findLivingOfficeHolder(characters, state.i, office.title);
      if (!holder) continue;
      const balance = state.departmentBalances?.[key] ?? 0;
      offices.n++; offices.wealth += holder.wealth ?? 0; offices.living += computeLivingCost(holder);
      offices.pool += balance; if (balance < 1) offices.poolBelowDue++;
    }
  }
  const due = nominal(GUILD_MASTER_STIPEND);
  for (const entry of getGuildKnowledgeStocks()) {
    const master = findMaster(characters, entry.burgId, entry.domain);
    if (!master) continue;
    masters.n++; masters.wealth += master.wealth ?? 0; masters.living += computeLivingCost(master);
    masters.pool += entry.treasury ?? 0; masters.due += due; if ((entry.treasury ?? 0) < due) masters.poolBelowDue++;
  }
  const round = (row: Row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, r2(v)]));
  return { rulers: round(rulers), offices: round(offices), masters: round(masters), guildDue: r2(due) };
}
const months = Number(monthsArg ?? 6);
const snapshots = [{ month: 0, ...snapshot() }];
for (let month = 1; month <= months; month++) {
  await advanceWorld(host, { months: 1 });
  snapshots.push({ month, ...snapshot() });
  writeFileSync(output, JSON.stringify({ input, snapshots }));
  console.log(`[pools] month ${month}`, JSON.stringify(snapshots.at(-1)));
}
process.exit(0);
