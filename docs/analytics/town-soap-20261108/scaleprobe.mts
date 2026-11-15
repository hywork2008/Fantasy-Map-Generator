/**
 * Scale of the town soap need (docs/analytics/town-soap-20261108.md): town and country people of a saved
 * map, and the barrels of soap, tallow and potash a year at 2 kg of soap a town person.
 *   npx tsx docs/analytics/town-soap-20261108/scaleprobe.mts <map.fmg>
 */
import { readFileSync } from "node:fs";
import { createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { getWorldContext } from "../../../src/extensions/economy/context/economyApi";

import { getMarketRuralPopulation } from "../../../src/extensions/economy/generators/marketPopulation";
import { getMarkets } from "../../../src/extensions/economy/context/trade";

const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare();
const world = getWorldContext();
let town = 0;
let towns = 0;
for (const burg of world.pack.burgs) {
  if (!burg?.i || burg.removed || !burg.market) continue;
  town += (burg.population ?? 0) * Math.max(1, world.populationRate || 1) * (world.urbanization ?? 1);
  towns++;
}
let rural = 0;
for (const market of getMarkets()) rural += getMarketRuralPopulation(world, market.i);
const soap = (town * 2) / 120;
console.log({ towns, town: Math.round(town), rural: Math.round(rural), soapBarrelsYear: Math.round(soap) });
process.exit(0);
