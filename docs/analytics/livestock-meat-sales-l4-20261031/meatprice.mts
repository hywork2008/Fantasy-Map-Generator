import { readFileSync } from "node:fs";
import { getMarkets, getGoods } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
await host.prepare(); applyConflictAutonomyFromEnv();
for (let m = 1; m <= 6; m++) {
  await advanceWorld(host, { months: 1 });
  const meat = getGoods().find((g: any) => g.name === "Meat")!;
  console.log(m, meat.value, getMarkets().map((x: any) => `${x.i}:${x.goods[meat.i]?.price}/${x.goods[meat.i]?.stock}`).join(" "));
}
host.dispose();
