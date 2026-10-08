#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const [mode, input, output, ...args] = process.argv.slice(2);
const occupancyArg = args.find(arg => arg.startsWith('--lot-occupancy='));
const tokens = args.filter(arg => arg !== occupancyArg);
const lotOccupancy = occupancyArg ? Number(occupancyArg.split('=')[1]) / 100 : undefined;
if (occupancyArg && !(lotOccupancy > 0 && lotOccupancy <= 1)) {
  console.error('--lot-occupancy must be a percentage in (0, 100]');
  process.exit(2);
}
if (!['export', 'compare'].includes(mode) || !input || !output || (mode === 'compare' && args.length)) {
  console.error('Usage: npm run housing:export -- <map.fmg> <inputs.csv> [--lot-occupancy=<1-100>] [burgId-or-exact-name ...]\n       npm run housing:batch -- <inputs.csv> <results.csv>');
  process.exit(2);
}
const result = spawnSync(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run', 'src/city-editor/core/housingBatch.cli.test.ts', '--reporter=dot'], {
  cwd: resolve(import.meta.dirname, '..'),
  env: {...process.env, HOUSING_BATCH: JSON.stringify({mode, input: resolve(input), output: resolve(output), tokens, lotOccupancy})},
  stdio: 'inherit'
});
process.exit(result.status ?? 1);
