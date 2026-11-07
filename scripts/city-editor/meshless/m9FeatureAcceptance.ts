#!/usr/bin/env node
/** Four fixed feature cases; no scale benchmark or seed search. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--out") throw Error("Use --out <new-report.json>");
const out = resolve(args[1]);
if (existsSync(out)) throw Error("Refusing to overwrite an observation");
mkdirSync(dirname(out), { recursive: true });
const run = spawnSync(process.execPath, [
  resolve("node_modules/vitest/vitest.mjs"), "run",
  "city-editor/generators/vector/m9FeatureAcceptance.test.ts", "--maxWorkers=1"
], { stdio: "inherit", env: { ...process.env, CE_MESHLESS_FEATURE_ACCEPTANCE_OUT: out } });
process.exitCode = run.status ?? 1;
