#!/usr/bin/env node
/**
 * Compare FMG burg inputs with the houses City Editor draws.
 *
 *   node scripts/compareBurgHousing.mjs "temp/Alyatland 2026-09-28-02-26.fmg" 157 207 385 Crild
 *
 * The first argument is an .fmg archive. Each following argument is a burg
 * index or an exact burg name (every burg with that name is included).
 * Prints JSON: input parameters, City Editor house counts, and the gap.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [archive, ...tokens] = process.argv.slice(2);
if (!archive || tokens.length === 0) {
  console.error('usage: node scripts/compareBurgHousing.mjs <map.fmg> <burgId-or-name>...');
  process.exit(2);
}

const out = join(mkdtempSync(join(tmpdir(), "housing-report-")), "report.json");
const result = spawnSync(
  "npx",
  ["vitest", "run", "src/city-editor/core/housingReport.cli.test.ts", "--reporter=dot"],
  {
    cwd: resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      HOUSING_ARCHIVE: resolve(archive),
      HOUSING_BURGS: JSON.stringify(tokens),
      HOUSING_OUT: out
    },
    encoding: "utf8"
  }
);

if (result.status !== 0) {
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

process.stdout.write(readFileSync(out, "utf8"));
