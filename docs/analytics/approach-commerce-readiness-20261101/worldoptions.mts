import { readFileSync } from "node:fs";
const R = "/Users/h-yamaguchi/Projects/fmg-2";
const { createNodeSimulationHost } = await import(`${R}/src/simulation/adapters/node`);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(process.argv[2])));
const w: any = host.world;
const o = w.options ?? {};
console.log(JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k]) => /settle|cultur|urban|pop|period|danger|init/i.test(k)))), "cultures", (w.pack.cultures ?? []).length, "burgs", w.pack.burgs.filter((b: any) => b?.i && !b.removed).length, "states", w.pack.states.filter((s: any) => s?.i && !s.removed).length, "urbanization", w.urbanization ?? w.pack?.urbanization);
host.dispose();
