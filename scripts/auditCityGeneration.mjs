#!/usr/bin/env node
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readCsv } from "../src/city-editor/core/batchCsv.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const input = args.shift(),
  output = args.shift();
let workers = 4,
  timeoutMs = 120000,
  limit = Infinity,
  resume = false,
  ids,
  debugDir,
  failedFrom;
function value(flag) {
  const next = args.shift();
  if (!next || next.startsWith("--")) throw new Error(`Missing value for ${flag}`);
  return next;
}
while (args.length) {
  const flag = args.shift();
  if (flag === "--resume") resume = true;
  else if (flag === "--workers") workers = Number(value(flag));
  else if (flag === "--timeout-ms") timeoutMs = Number(value(flag));
  else if (flag === "--limit") limit = Number(value(flag));
  else if (flag === "--burg") ids = new Set(value(flag).split(","));
  else if (flag === "--debug-dir") debugDir = value(flag);
  else if (flag === "--failed-from") failedFrom = value(flag);
  else throw new Error(`Unknown option: ${flag}`);
}
if (
  !input ||
  !output ||
  !Number.isSafeInteger(workers) ||
  workers < 1 ||
  workers > 16 ||
  !Number.isSafeInteger(timeoutMs) ||
  timeoutMs < 1000 ||
  !(limit === Infinity || (Number.isSafeInteger(limit) && limit > 0))
)
  throw new Error(
    "Usage: npm run ce:audit -- <inputs.csv> <report.jsonl> [--workers 4] [--timeout-ms 120000] [--limit N] [--burg 1,2] [--resume]"
  );
if (resolve(input) === resolve(output)) throw new Error("Audit output must differ from input CSV");
const source = readFileSync(input, "utf8");
const rows = readCsv(source);
if (!rows.length) throw new Error("No cities selected");
if (failedFrom) {
  if (ids) throw new Error("Use either --burg or --failed-from");
  const previousMetadata = JSON.parse(readFileSync(`${failedFrom}.meta.json`, "utf8"));
  if (previousMetadata.inputHash !== createHash("sha256").update(source).digest("hex"))
    throw new Error("--failed-from report belongs to different input CSV");
  const previous = new Map(
    readFileSync(failedFrom, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(line => {
        const result = JSON.parse(line);
        return [String(result.burgId), result];
      })
  );
  ids = new Set(
    [...previous]
      .filter(([, result]) => result.status !== "generated" || result.completeFixedApproaches === false)
      .map(([id]) => id)
  );
}
if (new Set(rows.map(r => r.burg_id)).size !== rows.length) throw new Error("Duplicate burg_id in input CSV");
if (ids && [...ids].some(id => !rows.some(r => r.burg_id === id))) throw new Error("Unknown --burg ID");
const hash = createHash("sha256");
for (const folder of ["src"]) {
  const visit = path => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const next = join(path, entry.name);
      if (entry.isDirectory() && entry.name !== "city-generator") visit(next);
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name))
        hash.update(next.slice(root.length)).update(readFileSync(next));
    }
  };
  visit(join(root, folder));
}
for (const file of [
  "scripts/auditCityGeneration.mjs",
  "scripts/cityGenerationAuditWorker.mjs",
  "scripts/lib/cityGenerationAuditEntry.ts",
  "package-lock.json"
])
  hash.update(readFileSync(join(root, file)));
const metadata = {
  schemaVersion: 1,
  input: resolve(input),
  inputHash: createHash("sha256").update(source).digest("hex"),
  codeHash: hash.digest("hex"),
  node: process.version,
  timeoutMs
};
const metaPath = `${output}.meta.json`;
const results = new Map();
if (resume) {
  if (!existsSync(output) || !existsSync(metaPath)) throw new Error("Resume requires report and metadata");
  if (JSON.stringify(JSON.parse(readFileSync(metaPath, "utf8"))) !== JSON.stringify(metadata))
    throw new Error("Resume input, code or timeout differs; use a new report path");
  const lines = readFileSync(output, "utf8").split("\n");
  for (const [i, line] of lines.entries())
    if (line.trim()) {
      try {
        const result = JSON.parse(line);
        if (!rows.some(row => row.burg_id === String(result.burgId))) throw new Error("Unknown checkpoint city");
        results.set(String(result.burgId), result);
      } catch {
        throw new Error(`Invalid checkpoint line ${i + 1}`);
      }
    }
} else {
  if (existsSync(output) || existsSync(metaPath)) throw new Error("Output exists; use --resume or a new report path");
  writeFileSync(output, "");
  writeFileSync(metaPath, `${JSON.stringify(metadata, null, 2)}\n`);
}
const completed = new Set([...results.values()].filter(r => r.status !== "interrupted").map(r => String(r.burgId)));
const queue = rows.filter(r => (!ids || ids.has(r.burg_id)) && !completed.has(r.burg_id)).slice(0, limit);
let cursor = 0,
  stopping = false;
const children = new Set();
function save(result) {
  if (result.preview && debugDir) {
    mkdirSync(debugDir, { recursive: true });
    result.debugFile = join(debugDir, `burg-${result.burgId}.json`);
    writeFileSync(result.debugFile, JSON.stringify(result.preview));
    delete result.preview;
  }
  appendFileSync(output, `${JSON.stringify(result)}\n`);
  results.set(String(result.burgId), result);
  console.error(
    `[ce:audit] ${results.size}/${rows.length} burg=${result.burgId} ${result.name}: ${result.status} ${(result.reasons ?? []).join(",")} (${Math.round((result.elapsedMs ?? 0) / 1000)}s)`
  );
}
async function lane() {
  let child;
  const startWorker = () =>
    new Promise((accept, reject) => {
      child = fork(join(root, "scripts/cityGenerationAuditWorker.mjs"), [], {
        cwd: root,
        execArgv: ["--import", "tsx"],
        stdio: ["ignore", "ignore", "inherit", "ipc"]
      });
      children.add(child);
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Audit worker initialization timed out"));
      }, 30000);
      const exited = () => {
        clearTimeout(timer);
        reject(new Error("Audit worker failed to initialize"));
      };
      child.once("exit", exited);
      child.once("message", message => {
        clearTimeout(timer);
        child.off("exit", exited);
        message.type === "ready" ? accept() : reject(new Error("Worker protocol"));
      });
      child.once("error", reject);
    });
  while (!stopping && cursor < queue.length) {
    const row = queue[cursor++];
    if (!child) await startWorker();
    const started = Date.now();
    const result = await new Promise(accept => {
      let lastSample,
        failures = [],
        settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.off("message", message);
        child.off("exit", exited);
        accept(result);
      };
      const message = message => {
        if (message.type === "progress") {
          lastSample = message.sample;
          if (lastSample.failure) failures.push(lastSample);
        } else if (message.type === "result") finish(message.result);
      };
      const exited = (code, signal) => {
        finish({
          burgId: Number(row.burg_id),
          name: row.name,
          status: stopping ? "interrupted" : "worker-exit",
          generated: null,
          elapsedMs: Date.now() - started,
          code,
          signal,
          lastSample,
          failures
        });
        children.delete(child);
        child = null;
      };
      const timer = setTimeout(() => {
        finish({
          burgId: Number(row.burg_id),
          name: row.name,
          status: "timeout",
          generated: null,
          elapsedMs: Date.now() - started,
          lastSample,
          failures
        });
        children.delete(child);
        child.kill("SIGKILL");
        child = null;
      }, timeoutMs);
      child.on("message", message);
      child.once("exit", exited);
      child.send({ row, captureRejected: !!debugDir });
    });
    save(result);
  }
  if (child) {
    children.delete(child);
    child.kill();
  }
}
process.on("SIGINT", () => {
  stopping = true;
  for (const child of children) child.kill("SIGKILL");
});
try {
  await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, lane));
} finally {
  for (const child of children) child.kill("SIGKILL");
}
const records = [...results.values()];
const counts = Object.fromEntries(
  [...new Set(records.map(r => r.status))].map(status => [status, records.filter(r => r.status === status).length])
);
const reasons = {};
for (const result of records.filter(r => r.status === "rejected"))
  for (const reason of result.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
writeFileSync(
  `${output}.summary.json`,
  `${JSON.stringify({ ...metadata, inputCities: rows.length, completedCities: records.filter(r => r.status !== "interrupted").length, counts, reasons, interrupted: stopping }, null, 2)}\n`
);
console.error(`[ce:audit] ${JSON.stringify(counts)} -> ${output}`);
if (stopping) process.exitCode = 130;
