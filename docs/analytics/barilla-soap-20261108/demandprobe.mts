/**
 * Trade demand factors of the alkalis (docs/analytics/barilla-soap-20261108.md): the per-head consumer and
 * industrial demand factors the global trade reserves are built on, for Glass, Soap and their ingredients,
 * on a saved map after preparation.
 *   npx tsx docs/analytics/barilla-soap-20261108/demandprobe.mts <map.fmg>
 */
import { readFileSync } from "node:fs";
import { createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getGoods } from "../../../src/extensions/economy/context/trade";
import { Markets } from "../../../src/extensions/economy/generators/markets-generator";
import { isGoodEnabled } from "../../../src/extensions/economy/generators/goods-generator";

const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare();
// biome-ignore lint/suspicious/noExplicitAny: probe reads the private trade context
const ctx = (Markets as any).buildGlobalTradeContext();
const names = ["Glass", "Soap", "Castile Soap", "Barilla", "Potash", "White sand", "Soda Ash", "Caustic Soda", "Tallow", "Oil", "Olives", "Cattle"];
for (const good of getGoods().filter(entry => names.includes(entry.name)))
  console.log(
    good.name.padEnd(14),
    "enabled", isGoodEnabled(good),
    "consumer", (ctx.consumerDemandFactors[good.i] ?? 0).toExponential(3),
    "industrial", (ctx.industrialDemandFactors[good.i] ?? 0).toExponential(3),
    "recipes", JSON.stringify(good.recipes ?? [])
  );
process.exit(0);
