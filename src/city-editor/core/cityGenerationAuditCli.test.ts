import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { writeCsv } from "./batchCsv";

const exec = promisify(execFile);
const root = process.cwd();
it("checkpoints errors independently, resumes without duplicates and refuses changed inputs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ce-audit-test-"));
  const input = join(dir, "input.csv"),
    output = join(dir, "report.jsonl");
  const run = (...options: string[]) =>
    exec(
      process.execPath,
      ["--import", "tsx", "scripts/auditCityGeneration.mjs", input, output, "--workers", "1", ...options],
      { cwd: root, timeout: 30000 }
    );
  const records = () =>
    readFileSync(output, "utf8")
      .trim()
      .split("\n")
      .map(line => JSON.parse(line));
  try {
    writeFileSync(
      input,
      writeCsv([
        { schema_version: "1", burg_id: "1", name: "bad descriptor", share_json: "{}", export_error: "" },
        { schema_version: "1", burg_id: "2", name: "export failure", share_json: "", export_error: "test failure" }
      ])
    );
    await run("--limit", "1");
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ burgId: 1, status: "error", generated: false });
    await run("--resume");
    expect(records().map(r => r.burgId)).toEqual([1, 2]);
    expect(records()[1].error).toContain("Descriptor export: test failure");
    await run("--resume");
    expect(records()).toHaveLength(2);
    await expect(run()).rejects.toThrow("Output exists");
    writeFileSync(input, `${readFileSync(input, "utf8")}\n`);
    await expect(run("--resume")).rejects.toThrow("Resume input, code or timeout differs");
    await expect(run("--failed-from", output)).rejects.toThrow("different input CSV");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
