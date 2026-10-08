import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { writeCsv } from "./batchCsv";

const exec = promisify(execFile);
it("filters cities, repeats sequentially, checkpoints failures and refuses overwriting", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ce-perf-cli-"));
  const input = join(dir, "inputs.csv"),
    output = join(dir, "result.jsonl");
  const run = (...options: string[]) =>
    exec(process.execPath, ["--import", "tsx", "scripts/benchmarkFmgCities.mjs", input, output, ...options], {
      cwd: process.cwd(),
      timeout: 30000
    });
  try {
    writeFileSync(
      input,
      writeCsv([
        { schema_version: "1", burg_id: "1", name: "skip", share_json: "{}" },
        { schema_version: "1", burg_id: "2", name: "export error", share_json: "", export_error: "failed" },
        { schema_version: "1", burg_id: "3", name: "invalid input", share_json: "{}" }
      ])
    );
    await expect(run("--burg", "99")).rejects.toThrow("Unknown burg");
    await expect(run("--timeout-ms", "NaN")).rejects.toThrow("Invalid timeoutMs");
    await run("--burg", "2,3", "--repeat", "2");
    const records = readFileSync(output, "utf8")
      .trim()
      .split("\n")
      .map(line => JSON.parse(line));
    expect(records.map(row => [row.burgId, row.run])).toEqual([
      [2, 1],
      [2, 2],
      [3, 1],
      [3, 2]
    ]);
    expect(records.every(row => row.status === "error" && row.timings.generationMs === undefined)).toBe(true);
    const summary = JSON.parse(readFileSync(`${output}.summary.json`, "utf8"));
    expect(summary).toMatchObject({ totalRuns: 4, statuses: { error: 4 } });
    expect(summary.cities[0].timings.generationMs).toBeNull();
    const meta = JSON.parse(readFileSync(`${output}.meta.json`, "utf8"));
    expect(meta).toMatchObject({ repeat: 2, execution: "sequential-fresh-process-per-run" });
    expect(meta.codeHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(run()).rejects.toThrow("Output exists");
    expect(readFileSync(output, "utf8").trim().split("\n")).toHaveLength(4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
