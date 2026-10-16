/**
 * One Node-environment golden run (scripts/simGolden.mts --env node), in its own process.
 * Usage: tsx scripts/lib/simGoldenNodeRun.mts <fixture.fmg> <days,comma,separated> [dumpDir]
 * Prints `{ checkpoints, unboundRandom }` as JSON on stdout; progress goes to stderr.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { advanceWorld, createNodeSimulationHost, loadWorld } from "../../src/simulation/adapters/node";
import { hashArchiveBytes, type WorldHashReport } from "../../src/simulation/goldenHash";

const [fixturePath, dayList, dumpDir] = process.argv.slice(2);
const days = dayList.split(",").map(Number);
const root = resolve(import.meta.dirname, "../..");
const log = (message: string) => console.error(`[sim:golden] [node] ${message}`);

const host = createNodeSimulationHost();
const capture = async (name: string) => {
  const bytes = await host.saveArchive();
  if (dumpDir) writeFileSync(resolve(dumpDir, `${name}.fmg`), bytes);
  return hashArchiveBytes(bytes);
};
const fixture = readFileSync(fixturePath);
await loadWorld(host, new Uint8Array(fixture.buffer, fixture.byteOffset, fixture.byteLength));

// Track R guard, as in the browser: advances bind Math.random to the simulation RNG, so any call
// that still reaches the ambient one is recorded by its first frame outside the shared helpers.
const counts: Record<string, number> = {};
const ambient = Math.random;
const helper = /\/utils\/probabilityUtils\.ts|\/node_modules\//;
Math.random = () => {
  const frames = (new Error().stack ?? "").split("\n").slice(2);
  const frame = frames.find(line => !helper.test(line)) ?? frames[0] ?? "unknown";
  const key = frame.trim().replace(/^at /, "").replace(`${root}/`, "");
  counts[key] = (counts[key] ?? 0) + 1;
  return ambient();
};

const checkpoints: Record<string, WorldHashReport> = { "day-0": await capture("day-0") };
let elapsed = 0;
for (const day of days) {
  const started = performance.now();
  await advanceWorld(host, { days: day - elapsed });
  log(`advanced ${day - elapsed} days in ${Math.round(performance.now() - started)} ms`);
  elapsed = day;
  checkpoints[`day-${day}`] = await capture(`day-${day}`);
}
Math.random = ambient;
host.dispose();
process.stdout.write(JSON.stringify({ checkpoints, unboundRandom: Object.entries(counts).sort((a, b) => b[1] - a[1]) }));
