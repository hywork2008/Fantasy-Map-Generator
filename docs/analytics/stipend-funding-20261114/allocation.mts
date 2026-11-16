import { readFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getTreasuryAllocationSnapshots } from "../../../src/extensions/economy/generators/treasuryAllocation";
import { getSimulationCharacters } from "../../../src/extensions/characters/charactersContext";
import { getRulerId } from "../../../src/extensions/nobility/nobilityContext";
import { computeLivingCost } from "../../../src/extensions/economy/generators/characterLivingCosts";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare();
await advanceWorld(host, { months: 1 });
// Stipend funding (docs/analytics/stipend-funding-20261114.md): after one month, each state's budget
// income given to allocateTreasury, the household and office stipends it paid, its treasury and its
// ruler's living cost.  npx tsx allocation.mts <map.fmg>
const snaps = new Map(getTreasuryAllocationSnapshots().map(s => [s.stateId, s]));
const chars = getSimulationCharacters();
console.log("state income household officeStipends treasury rulerWealth rulerLiving");
for (const s of getWorldContext().pack.states.filter(s => s?.i && !s.removed)) {
  const r = chars.find(c => c.i === getRulerId(s) && !c.dead);
  const a = snaps.get(s.i);
  console.log([s.i, a?.domesticIncome, a?.household, a?.officeStipendsPaid, Math.round(s.treasury ?? 0), r?.wealth, r ? computeLivingCost(r) : ""].join(" "));
}
process.exit(0);
