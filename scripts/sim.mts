#!/usr/bin/env tsx
/**
 * Headless simulation runner (docs/plan/simulation-core-separation.md §20, S6).
 *
 * Loads a .fmg into a DOM-free SimulationHost (Node Adapter), advances it and writes the world:
 *
 *   npm run sim -- <map.fmg> [--days N] [--months N] [--years N] [--out world.fmg]
 *                 [--extensions economy,nobility] [--timeline continue|new] [--settings settings.json]
 *                 [--hash]
 *
 * --timeline   continue (default) replays the saved RNG; new starts a fresh timeline from the seed.
 * --settings   JSON object of simulation settings (localStorage keys), for keys the .fmg does not carry.
 * --hash       print the golden digest of the result (same hash as `npm run test:sim-golden`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BUILTIN_SIMULATION_EXTENSION_IDS, createNodeSimulationHost } from "../src/simulation/adapters/node";
import { hashArchiveBytes } from "../src/simulation/goldenHash";

const log = (message: string) => console.error(`[sim] ${message}`);

function parseArgs(argv: string[]) {
  const options = {
    input: "",
    years: 0,
    months: 0,
    days: 0,
    out: undefined as string | undefined,
    extensions: BUILTIN_SIMULATION_EXTENSION_IDS,
    timeline: "continue" as "continue" | "new",
    settings: undefined as Record<string, string> | undefined,
    hash: false
  };
  const args = [...argv];
  const value = (flag: string) => {
    const next = args.shift();
    if (!next || next.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    return next;
  };
  const count = (flag: string) => {
    const n = Number(value(flag));
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${flag} must be a non-negative integer`);
    return n;
  };
  while (args.length) {
    const arg = args.shift() as string;
    if (arg === "--days") options.days = count(arg);
    else if (arg === "--months") options.months = count(arg);
    else if (arg === "--years") options.years = count(arg);
    else if (arg === "--out") options.out = resolve(value(arg));
    else if (arg === "--extensions") options.extensions = value(arg).split(",").filter(Boolean);
    else if (arg === "--timeline") {
      const mode = value(arg);
      if (mode !== "continue" && mode !== "new") throw new Error("--timeline must be continue or new");
      options.timeline = mode;
    } else if (arg === "--settings") options.settings = JSON.parse(readFileSync(resolve(value(arg)), "utf8"));
    else if (arg === "--hash") options.hash = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else if (!options.input) options.input = resolve(arg);
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.input) throw new Error("Usage: npm run sim -- <map.fmg> [--days N] [--out world.fmg]");
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const host = createNodeSimulationHost({ extensions: options.extensions, settings: options.settings });
  const bytes = readFileSync(options.input);
  let started = performance.now();
  await host.loadArchive(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
    timeline: { mode: options.timeline }
  });
  await host.prepare();
  const date = () => `${host.simulation.currentYear}-${host.simulation.currentMonth}-${host.simulation.currentDay}`;
  log(`loaded ${options.input} (${options.extensions.join(", ") || "core only"}) at ${date()} in ${ms(started)}`);

  started = performance.now();
  host.advance({ years: options.years, months: options.months, days: options.days });
  // Economy's monthly settlement runs right after the advance returns.
  await new Promise(done => setImmediate(done));
  log(`advanced to ${date()} (tick ${host.simulation.tickCount}) in ${ms(started)}`);

  const result = await host.saveArchive();
  if (options.out) {
    writeFileSync(options.out, result);
    log(`wrote ${options.out} (${result.byteLength} bytes)`);
  }
  if (options.hash) console.log((await hashArchiveBytes(result)).digest);
  host.dispose();
}

function ms(started: number): string {
  return `${Math.round(performance.now() - started)} ms`;
}

await main();
