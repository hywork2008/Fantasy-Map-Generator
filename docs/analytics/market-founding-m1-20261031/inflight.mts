/** Why a market due for dissolution waits: each month, the in-flight reason of every market at or past the months. */
import { readFileSync, writeFileSync } from "node:fs";
import { getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { marketTrafficInFlight } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/generators/marketDissolution";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const [input, output, length = "36"] = process.argv.slice(2);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();
const rows: any[] = [];
for (let month = 1; month <= Number(length); month++) {
  await advanceWorld(host, { months: 1 });
  for (const m of getMarkets() as any[]) if ((m.lowRuralWealthMonths ?? 0) >= 12) rows.push({ month, market: m.i, low: m.lowRuralWealthMonths, reason: marketTrafficInFlight(m), escrow: m.marketTreasury?.tradeEscrow, locked: m.marketTreasury?.tradeCapitalLocked });
  writeFileSync(output, JSON.stringify(rows));
  process.stderr.write(`[inflight] ${month}/${length}\n`);
}
host.dispose();
