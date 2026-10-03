#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const [mode, input, output, ...tokens] = process.argv.slice(2);
if (!['export', 'compare'].includes(mode) || !input || !output || (mode === 'compare' && tokens.length)) {
  console.error('Usage: npm run housing:export -- <map.fmg> <inputs.csv> [burgId-or-exact-name ...]\n       npm run housing:batch -- <inputs.csv> <results.csv>');
  process.exit(2);
}
const result = spawnSync(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run', 'src/city-editor/core/housingBatch.cli.test.ts', '--reporter=dot'], {
  cwd: resolve(import.meta.dirname, '..'),
  env: {...process.env, HOUSING_BATCH: JSON.stringify({mode, input: resolve(input), output: resolve(output), tokens})},
  stdio: 'inherit'
});
process.exit(result.status ?? 1);
