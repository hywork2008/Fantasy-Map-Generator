#!/usr/bin/env node
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { cpus, platform, arch } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { readCsv, writeCsv } from "../src/city-editor/core/batchCsv.ts";

const root = resolve(import.meta.dirname, "..");
const usage = "Usage: npm run ce:perf -- <map.fmg|inputs.csv> <report.jsonl> [--burg 1,2] [--name exact-name] [--limit N] [--repeat 3] [--render] [--details] [--timeout-ms 120000]\n       npm run ce:perf -- <map.fmg> <inputs.csv> --list [--burg 1,2] [--name exact-name]";
const args = process.argv.slice(2);
if (args.includes("--help")) { console.log(usage); process.exit(0); }
let currentChild, interruptCurrent;
let stopping = false;
process.on("SIGINT", () => { stopping = true; interruptCurrent?.(); });

function hashFile(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function codeHash() {
  const hash = createHash("sha256");
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "city-generator") visit(path);
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name))
        hash.update(path.slice(root.length)).update(readFileSync(path));
    }
  };
  visit(join(root, "src"));
  for (const path of ["scripts/benchmarkFmgCities.mjs", "scripts/cityGenerationPerformanceWorker.mjs", "scripts/lib/cityGenerationPerformanceEntry.ts", "package-lock.json"])
    hash.update(path).update(readFileSync(join(root, path)));
  return hash.digest("hex");
}

/** One new process per city and repetition prevents cross-city/cache contamination. */
function worker(request, timeoutMs) {
  return new Promise(resolveResult => {
    const start = performance.now();
    const child = fork(join(root, "scripts/cityGenerationPerformanceWorker.mjs"), [], {
      cwd: root, execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "inherit", "ipc"]
    });
    currentChild = child;
    let result, ready = false, taskStart, bootstrapMs, lastSample;
    const phases = [];
    let timer;
    const finish = value => {
      if (result) return;
      result = { ...value, processMs: performance.now() - start, bootstrapMs,
        ...(taskStart ? { taskWallMs: performance.now() - taskStart } : {}) };
      clearTimeout(timer);
      child.kill("SIGKILL");
    };
    interruptCurrent = () => finish({ status: "interrupted", generated: null, phases, lastSample });
    timer = setTimeout(() => finish({ status: "bootstrap-timeout", generated: null, phases }), 60000);
    child.on("message", message => {
      if (result) return;
      if (message.type === "ready") {
        if (ready) return;
        ready = true; bootstrapMs = message.bootstrapMs; taskStart = performance.now();
        clearTimeout(timer);
        timer = setTimeout(() => finish({ status: "timeout", generated: null, phases, lastSample }), timeoutMs);
        child.send(request, error => { if (error) finish({ status: "worker-exit", generated: null, error: error.message, phases }); });
      } else if (message.type === "progress") {
        lastSample = message.sample; phases.push(lastSample);
      } else if (message.type === "export-progress") {
        process.stderr.write(`[ce:perf] exporting burg=${message.burgId}\n`);
      } else if (message.type === "result") finish(message.result);
      else if (message.type === "fatal") finish({ status: "error", generated: false, error: message.error, phases });
    });
    child.on("error", error => finish({ status: "worker-exit", generated: null, error: error.message, phases }));
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      currentChild = undefined; interruptCurrent = undefined;
      resolveResult(result ?? { status: "worker-exit", generated: null, error: `Worker exited: ${code ?? signal}`, phases,
        processMs: performance.now() - start, bootstrapMs, lastSample });
    });
  });
}
function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const n = sorted.length;
  return { count: n, min: sorted[0], median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    mean: sorted.reduce((a, b) => a + b, 0) / n, p95: sorted[Math.ceil(n * 0.95) - 1], max: sorted[n - 1] };
}
function parseBreakdown(json) {
  if (!json) return null;
  const timings = JSON.parse(json);
  if (!Array.isArray(timings) || timings.some(t => typeof t.path !== "string" ||
      ![t.elapsedMs, t.selfMs, t.calls, t.depth].every(v => Number.isFinite(v) && v >= 0)))
    throw new Error("Invalid fmg_breakdown_json");
  return timings;
}
function printBreakdown(label, timings) {
  if (!timings?.length) return;
  console.error(`[ce:perf] ${label} — inclusive(ms) / self(ms) / calls`);
  for (const t of timings) console.error(
    `  ${t.elapsedMs.toFixed(3).padStart(12)} / ${t.selfMs.toFixed(3).padStart(12)} / ${String(t.calls).padStart(6)}  ${"  ".repeat(t.depth)}${t.path.split("/").at(-1)}`
  );
}
function summarizeBreakdown(results) {
  const paths = new Set(results.flatMap(r => (r.generationBreakdown ?? []).map(t => t.path)));
  return [...paths].sort().map(path => {
    const timings = results.flatMap(r => (r.generationBreakdown ?? []).filter(t => t.path === path));
    return { path, parent: timings[0].parent, depth: timings[0].depth,
      elapsedMs: stats(timings.map(t => t.elapsedMs)), selfMs: stats(timings.map(t => t.selfMs)), calls: stats(timings.map(t => t.calls)) };
  });
}
function summarize(results) {
  const statuses = {}, cities = new Map();
  for (const result of results) {
    statuses[result.status] = (statuses[result.status] ?? 0) + 1;
    const city = cities.get(result.burgId) ?? { burgId: result.burgId, name: result.name, results: [] };
    city.results.push(result); cities.set(result.burgId, city);
  }
  return { schemaVersion: 1, totalRuns: results.length, statuses, cities: [...cities.values()].map(city => {
    const success = city.results.filter(r => r.status === "generated");
    const timings = {};
    for (const key of ["incomingParseMs", "gridMs", "settingsMs", "generationMs", "svgBuildMs"])
      timings[key] = stats(success.map(r => r.timings?.[key]));
    return { burgId: city.burgId, name: city.name, runs: city.results.length, generated: success.length,
      timings, totalMs: stats(success.map(r => r.totalMs)),
      fmgBreakdown: city.results[0].fmgBreakdown,
      generationBreakdown: summarizeBreakdown(success) };
  }) };
}
async function main() {
  const inputArg = args.shift(), outputArg = args.shift();
  let list = false, render = false, details = false, repeat = 1, limit, timeoutMs = 120000, prepareTimeoutMs = 600000;
  const tokens = [];
  const value = flag => { const val = args.shift(); if (!val || val.startsWith("--")) throw new Error(`Missing value for ${flag}`); return val; };
  while (args.length) {
    const flag = args.shift();
    if (flag === "--list") list = true;
    else if (flag === "--render") render = true;
    else if (flag === "--details") details = true;
    else if (flag === "--burg") {
      const ids = value(flag).split(",");
      if (ids.some(id => !/^[1-9]\d*$/.test(id))) throw new Error("--burg requires positive IDs separated by commas");
      tokens.push(...ids);
    } else if (flag === "--name") tokens.push(value(flag));
    else if (flag === "--limit") limit = Number(value(flag));
    else if (flag === "--repeat") repeat = Number(value(flag));
    else if (flag === "--timeout-ms") timeoutMs = Number(value(flag));
    else if (flag === "--prepare-timeout-ms") prepareTimeoutMs = Number(value(flag));
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!inputArg || !outputArg) throw new Error(usage);
  for (const [key, val] of Object.entries({ repeat, timeoutMs, prepareTimeoutMs, ...(limit === undefined ? {} : { limit }) }))
    if (!Number.isSafeInteger(val) || val < 1 || (key.endsWith("Ms") && val < 1000)) throw new Error(`Invalid ${key}`);
  const input = resolve(inputArg), output = resolve(outputArg);
  const format = extname(input).toLowerCase();
  if (![".fmg", ".csv"].includes(format)) throw new Error("Input must be .fmg or housing/CE input .csv");
  if (list && (format !== ".fmg" || render || repeat !== 1)) throw new Error("--list requires .fmg and cannot use --render or --repeat");
  const paths = [output, `${output}.meta.json`, ...(!list ? [`${output}.summary.json`, ...(format === ".fmg" ? [`${output}.inputs.csv`] : [])] : [])];
  for (const path of paths) {
    if (path === input) throw new Error("Output must differ from input");
    if (existsSync(path)) throw new Error(`Output exists: ${path}; choose a new output path`);
  }
  const metadata = { schemaVersion: 1, createdAt: new Date().toISOString(), input, inputHash: hashFile(input),
    codeHash: codeHash(), node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model,
    mode: list ? "list" : "measure", repeat, render, details, tokens, limit: limit ?? null, timeoutMs, prepareTimeoutMs,
    execution: "sequential-fresh-process-per-run", archiveReadMs: null, inputListHash: null };
  let rows;
  if (format === ".fmg") {
    const prepared = await worker({ mode: "prepare", input, tokens, limit }, prepareTimeoutMs);
    if (!prepared.rows) throw new Error(`FMG preparation ${prepared.status}: ${prepared.error ?? "stopped"}`);
    rows = prepared.rows.map(row => Object.fromEntries(Object.entries(row).map(([key, val]) => [key, String(val)])));
    metadata.archiveReadMs = prepared.archiveReadMs;
    metadata.prepareBootstrapMs = prepared.bootstrapMs;
  } else {
    rows = readCsv(readFileSync(input, "utf8"));
    const all = rows;
    for (const token of tokens)
      if (!all.some(row => /^\d+$/.test(token) ? row.burg_id === token : row.name === token)) throw new Error(`Unknown burg: ${token}`);
    if (tokens.length) rows = rows.filter(row => tokens.some(token => /^\d+$/.test(token) ? row.burg_id === token : row.name === token));
    rows = rows.slice(0, limit);
  }
  if (!rows.length) throw new Error("No cities selected");
  if (rows.some(row => !/^[1-9]\d*$/.test(row.burg_id)) || new Set(rows.map(row => row.burg_id)).size !== rows.length)
    throw new Error("Input list requires unique positive burg_id values");
  for (const row of rows) parseBreakdown(row.fmg_breakdown_json);
  const csv = writeCsv(rows);
  metadata.inputListHash = createHash("sha256").update(csv).digest("hex");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(`${output}.meta.json`, `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx" });
  if (list) {
    writeFileSync(output, csv, { flag: "wx" });
    if (details) for (const row of rows) {
      console.error(`[ce:perf] burg=${row.burg_id} ${row.name}`);
      printBreakdown("FMG descriptor", parseBreakdown(row.fmg_breakdown_json));
    }
    console.error(`[ce:perf] Wrote ${rows.length} cities to ${output}`);
    return;
  }
  if (format === ".fmg") writeFileSync(`${output}.inputs.csv`, csv, { flag: "wx" });
  writeFileSync(output, "", { flag: "wx" });
  const results = [];
  for (const row of rows) {
    for (let run = 1; run <= repeat && !stopping; run++) {
      const measured = await worker({ mode: "measure", row, render }, timeoutMs);
      const fmgTimings = Object.fromEntries(Object.entries(row).filter(([key, val]) => key.startsWith("fmg_") && key.endsWith("_ms") && val !== "" && Number.isFinite(Number(val))).map(([key, val]) => [key, Number(val)]));
      const exportTimings = Object.fromEntries(Object.entries(row).filter(([key, val]) => key.startsWith("export_") && key.endsWith("_ms") && val !== "" && Number.isFinite(Number(val))).map(([key, val]) => [key, Number(val)]));
      const result = { schemaVersion: 1, ...measured, generationBreakdown: measured.generationBreakdown ?? null, burgId: Number(row.burg_id), name: row.name, run,
        fmgTimings: Object.keys(fmgTimings).length ? fmgTimings : null,
        exportTimings: Object.keys(exportTimings).length ? exportTimings : null,
        fmgBreakdown: parseBreakdown(row.fmg_breakdown_json) };
      appendFileSync(output, `${JSON.stringify(result)}\n`);
      results.push(result);
      writeFileSync(`${output}.summary.json`, `${JSON.stringify(summarize(results), null, 2)}\n`);
      console.error(`[ce:perf] ${results.length}/${rows.length * repeat} burg=${row.burg_id} ${row.name} run=${run} ${result.status} generation=${result.timings?.generationMs === undefined ? "n/a" : `${Math.round(result.timings.generationMs)}ms`}`);
      if (details) {
        if (run === 1) printBreakdown("FMG descriptor (input export)", result.fmgBreakdown);
        printBreakdown(`CE generation run=${run}`, result.generationBreakdown);
      }
    }
    if (stopping) break;
  }
  if (stopping) process.exitCode = 130;
  console.error(`[ce:perf] Wrote ${results.length} runs to ${output}`);
}
try { await main(); } catch (error) {
  console.error(`[ce:perf] ${error?.message ?? String(error)}`);
  process.exitCode = stopping ? 130 : 1;
} finally { currentChild?.kill("SIGKILL"); }
