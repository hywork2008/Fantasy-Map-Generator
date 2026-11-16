#!/usr/bin/env node
/** Explicit feature-parity comparison of the fixed cases (docs/plan/ce-meshless-feature-parity.md P0).
 * node --import tsx scripts/city-editor/meshless/p0Parity.ts --out <new-report.json>
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--out") throw Error("Use --out <new-report.json>");
const out = resolve(args[1]);
if (existsSync(out)) throw Error("Refusing to overwrite an observation");
mkdirSync(dirname(out), { recursive: true });
const run = spawnSync(
  process.execPath,
  [
    resolve("node_modules/vitest/vitest.mjs"),
    "run",
    "city-editor/services/vector/parity/parityObservation.test.ts",
    "--maxWorkers=1"
  ],
  { stdio: "inherit", env: { ...process.env, CE_MESHLESS_PARITY_OUT: out } }
);
process.exitCode = run.status ?? 1;
