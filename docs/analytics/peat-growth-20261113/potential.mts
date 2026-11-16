/**
 * Peat growth (docs/analytics/peat-growth-20261113.md): after one month, each market's monthly peat
 * potential (peatSupply.ts) summed over the map, with the market's peat stock and the cut.
 *
 *   npx tsx docs/analytics/peat-growth-20261113/potential.mts <map.fmg>
 */
import { readFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import { getMarkets } from "../../../src/extensions/economy/context/trade";

const [input] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
applyConflictAutonomyFromEnv();
await host.prepare();
await advanceWorld(host, { months: 1 });
const rows = getMarkets()
  .filter(market => market?.peatSupply)
  .map(market => ({ market: market.i, potential: market.peatSupply!.potential }))
  .sort((a, b) => b.potential - a.potential);
const total = rows.reduce((sum, row) => sum + row.potential, 0);
console.log(JSON.stringify({ markets: rows.length, monthlyPotential: Math.round(total), yearly: Math.round(total * 12), top: rows.slice(0, 5) }));
process.exit(0);
