#!/usr/bin/env node
/** Explicit fixed-scale observation for the block fabric scaling plan (S0). Not a seed search.
 * node --import tsx scripts/city-editor/meshless/scalingBaseline.ts --out <new-report.json> [--cases 1000,5000] [--raw <dir>]
 * Cases: 1000, 5000, 20000, 50000 (default) and 200000 (opt-in).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const out = option("--out");
if (!out) throw Error("Use --out <new-report.json> [--cases 1000,5000] [--raw <dir>]");
const target = resolve(out);
if (existsSync(target)) throw Error("Refusing to overwrite an observation");
mkdirSync(dirname(target), { recursive: true });
const raw = option("--raw");
const run = spawnSync(
  process.execPath,
  [
    resolve("node_modules/vitest/vitest.mjs"),
    "run",
    "city-editor/generators/vector/scalingObservation.test.ts",
    "--maxWorkers=1"
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CE_MESHLESS_SCALING_OUT: target,
      ...(option("--cases") ? { CE_MESHLESS_SCALING_CASES: option("--cases") } : {}),
      ...(raw ? { CE_MESHLESS_SCALING_RAW: resolve(raw) } : {})
    }
  }
);
process.exitCode = run.status ?? 1;
