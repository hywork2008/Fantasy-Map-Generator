import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// CE uses browser APIs and import.meta.env; run the diagnostic through Vite.
// Usage: npx tsx scripts/diag_518.ts [archive.fmg] [burgId ...]
const [archive = "temp/000.savdata/Rarerland 2026-10-04-22-24.fmg", ...ids] = process.argv.slice(2);
const output = resolve("temp/ce-river-fixes");
const result = spawnSync("npx", ["vitest", "run", "src/city-editor/core/rarerlandArchive.cli.test.ts", "--maxWorkers=1"], {
  cwd: process.cwd(),
  env: { ...process.env, CE_DIAG_ARCHIVE: resolve(archive), CE_DIAG_BURGS: ids.length ? ids.join(",") : "518", CE_DIAG_OUT: output },
  encoding: "utf8"
});
if (result.status !== 0) {
  process.stderr.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  process.exit(result.status ?? 1);
}
process.stdout.write(readFileSync(resolve(output, "results.json"), "utf8"));
console.log(`\nSVG output: ${output}`);
