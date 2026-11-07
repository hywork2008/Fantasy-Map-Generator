#!/usr/bin/env node
/** Explicit bounded acceptance, not a full-suite or seed-search runner.
 * node --import tsx scripts/city-editor/meshless/m9Acceptance.ts --out <new-report.json>
 */
import { existsSync,mkdirSync } from "node:fs";
import { resolve,dirname } from "node:path";
import { spawnSync } from "node:child_process";
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=="--out")throw Error("Use --out <new-report.json>");
const out=resolve(args[1]);if(existsSync(out))throw Error("Refusing to overwrite an observation");mkdirSync(dirname(out),{recursive:true});
const run=spawnSync(process.execPath,[resolve("node_modules/vitest/vitest.mjs"),"run","city-editor/generators/vector/m9Acceptance.test.ts","--maxWorkers=1"],{stdio:"inherit",env:{...process.env,CE_MESHLESS_ACCEPTANCE_OUT:out}});
process.exitCode=run.status??1;
