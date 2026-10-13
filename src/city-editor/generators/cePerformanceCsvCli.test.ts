import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const exec = promisify(execFile);

it("flattens CE performance JSONL into an Excel-readable CSV", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ce-perf-csv-"));
  const input = join(dir, "report.jsonl");
  const output = join(dir, "report.csv");
  try {
    writeFileSync(
      input,
      `${[
        { burgId: 2, name: 'A, "Town"', run: 1, timings: { generationMs: 12.5 }, phases: [{ phase: "plan" }] },
        { burgId: 3, name: "B", run: 1, timings: { gridMs: 2 }, spatialMetrics: null, phases: [] }
      ]
        .map(record => JSON.stringify(record))
        .join("\n")}\n`
    );
    const result = await exec(process.execPath, ["--import", "tsx", "scripts/cePerformanceCsv.mjs", input, output], {
      cwd: process.cwd()
    });
    const csv = readFileSync(output, "utf8");
    expect(result.stderr).toContain("2 rows");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"timings.generationMs"');
    expect(csv).toContain('"timings.gridMs"');
    expect(csv).toContain('"A, ""Town"""');
    expect(csv).toContain('"[{""phase"":""plan""}]"');
    await expect(
      exec(process.execPath, ["--import", "tsx", "scripts/cePerformanceCsv.mjs", input, output], {
        cwd: process.cwd()
      })
    ).rejects.toThrow("Output exists");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
