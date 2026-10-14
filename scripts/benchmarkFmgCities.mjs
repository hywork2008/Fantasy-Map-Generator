#!/usr/bin/env node
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { cpus, platform, arch } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { readCsv, writeCsv } from "../src/city-editor/services/analysis/batchCsv.ts";

const root = resolve(import.meta.dirname, "..");
const usage = "Usage: npm run ce:perf -- <map.fmg|inputs.csv> <report.jsonl> [--burg 1,2] [--name exact-name] [--limit N] [--repeat 3] [--render] [--details] [--timeout-ms 120000] [--setting townWallBuildOrder=inner-first] [--warm] [--warmup 3] [--jobs N] [--svg-dir dir]\n       npm run ce:perf -- <map.fmg> <inputs.csv> --list [--burg 1,2] [--name exact-name]";
const args = process.argv.slice(2);
/** Generation settings that `--setting` may override for A/B runs on the same input list. */
const SETTING_OVERRIDES = {
  townWallBuildOrder: ["outer-first", "inner-first"],
  townWallRings: ["single", "double"],
  townWallDefensePolicy: ["legacy", "closed"],
  innerWallState: ["standing", "razed"],
  generationMethod: ["mesh-first", "skeleton-first"]
};
if (args.includes("--help")) { console.log(usage); process.exit(0); }
let stopping = false;
process.on("SIGINT", () => { stopping = true; for (const interrupt of [...interrupts]) interrupt(); });

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

/**
 * A forked generation worker. Fresh mode uses one per city and repetition, which prevents
 * cross-city/cache contamination; `--warm` keeps it for many runs so JIT and module start-up
 * are paid once, as in the editor.
 */
class Worker {
  constructor() { this.children = new Set(); }
  spawn() {
    const start = performance.now();
    const child = fork(join(root, "scripts/cityGenerationPerformanceWorker.mjs"), [], {
      cwd: root, execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "inherit", "ipc"]
    });
    this.child = child; this.spawnedAt = start; this.bootstrapMs = undefined; this.exited = false;
    children.add(child);
    this.ready = new Promise(resolveReady => {
      const timer = setTimeout(() => resolveReady(false), 60000);
      child.on("message", message => {
        if (message.type === "ready") { clearTimeout(timer); this.bootstrapMs = message.bootstrapMs; resolveReady(true); }
        else this.onMessage?.(message);
      });
      child.on("error", error => { clearTimeout(timer); this.onExit?.(error.message); resolveReady(false); });
      child.on("exit", (code, signal) => {
        clearTimeout(timer); this.exited = true; children.delete(child);
        this.onExit?.(`Worker exited: ${code ?? signal}`); resolveReady(false);
      });
    });
  }
  kill() { this.child?.kill("SIGKILL"); this.child = undefined; }
  async run(request, timeoutMs) {
    if (!this.child || this.exited) this.spawn();
    const spawnedAt = this.spawnedAt;
    const fresh = this.runs === undefined || this.runs === 0;
    const phases = [];
    let lastSample;
    if (!(await this.ready)) {
      this.kill(); this.runs = 0;
      return { status: "bootstrap-timeout", generated: null, phases, processMs: performance.now() - spawnedAt };
    }
    const taskStart = performance.now();
    return new Promise(resolveResult => {
      let done = false;
      const finish = (value, broken) => {
        if (done) return;
        done = true; clearTimeout(timer);
        this.onMessage = this.onExit = undefined; interrupts.delete(interrupt);
        this.runs = broken ? 0 : (this.runs ?? 0) + 1;
        if (broken) this.kill();
        resolveResult({ ...value, ...(fresh ? { processMs: performance.now() - spawnedAt, bootstrapMs: this.bootstrapMs } : {}),
          taskWallMs: performance.now() - taskStart });
      };
      const interrupt = () => finish({ status: "interrupted", generated: null, phases, lastSample }, true);
      interrupts.add(interrupt);
      const timer = setTimeout(() => finish({ status: "timeout", generated: null, phases, lastSample }, true), timeoutMs);
      this.onMessage = message => {
        if (message.type === "progress") { lastSample = message.sample; phases.push(lastSample); }
        else if (message.type === "export-progress") process.stderr.write(`[ce:perf] exporting burg=${message.burgId}\n`);
        else if (message.type === "result") finish(message.result, false);
        else if (message.type === "fatal") finish({ status: "error", generated: false, error: message.error, phases }, true);
      };
      this.onExit = error => finish({ status: "worker-exit", generated: null, error, phases, lastSample }, true);
      this.child.send(request, error => { if (error) finish({ status: "worker-exit", generated: null, error: error.message, phases }, true); });
    });
  }
}
const children = new Set(), interrupts = new Set();
/** One request in its own process, as before `--warm`. */
async function worker(request, timeoutMs) {
  const w = new Worker();
  try { return await w.run(request, timeoutMs); } finally { w.kill(); }
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
    timings.spatialMetricsMs = stats(success.map(r => r.timings?.spatialMetricsMs));
    const spatialKeys = new Set(success.flatMap(r => Object.keys(r.spatialMetrics ?? {})));
    const spatialMetrics = Object.fromEntries([...spatialKeys].map(key =>
      [key, stats(success.map(r => r.spatialMetrics?.[key]))]));
    return { burgId: city.burgId, name: city.name, runs: city.results.length, generated: success.length,
      size: city.results.find(r => r.size)?.size ?? null,
      population: city.results.find(r => r.population !== undefined)?.population ?? null,
      dwellings: city.results.find(r => r.dwellings !== undefined)?.dwellings ?? null,
      spatialMetrics,
      timings, totalMs: stats(success.map(r => r.totalMs)),
      fmgBreakdown: city.results[0].fmgBreakdown,
      generationBreakdown: summarizeBreakdown(success) };
  }) };
}
async function main() {
  const inputArg = args.shift(), outputArg = args.shift();
  let list = false, render = false, details = false, repeat = 1, limit, timeoutMs = 120000, prepareTimeoutMs = 600000;
  let warm = false, warmup = 3, jobs = 1, svgDir;
  const tokens = [];
  const overrides = {};
  const value = flag => { const val = args.shift(); if (!val || val.startsWith("--")) throw new Error(`Missing value for ${flag}`); return val; };
  while (args.length) {
    const flag = args.shift();
    if (flag === "--list") list = true;
    else if (flag === "--render") render = true;
    else if (flag === "--details") details = true;
    else if (flag === "--warm") warm = true;
    else if (flag === "--warmup") warmup = Number(value(flag));
    else if (flag === "--jobs") jobs = Number(value(flag));
    else if (flag === "--svg-dir") { svgDir = resolve(value(flag)); render = true; }
    else if (flag === "--burg") {
      const ids = value(flag).split(",");
      if (ids.some(id => !/^[1-9]\d*$/.test(id))) throw new Error("--burg requires positive IDs separated by commas");
      tokens.push(...ids);
    } else if (flag === "--name") tokens.push(value(flag));
    else if (flag === "--limit") limit = Number(value(flag));
    else if (flag === "--repeat") repeat = Number(value(flag));
    else if (flag === "--timeout-ms") timeoutMs = Number(value(flag));
    else if (flag === "--prepare-timeout-ms") prepareTimeoutMs = Number(value(flag));
    else if (flag === "--setting") {
      const [key, val] = value(flag).split("=");
      if (!SETTING_OVERRIDES[key]?.includes(val))
        throw new Error(`--setting supports: ${Object.entries(SETTING_OVERRIDES).map(([k, v]) => `${k}=${v.join("|")}`).join(", ")}`);
      overrides[key] = val;
    }
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!inputArg || !outputArg) throw new Error(usage);
  for (const [key, val] of Object.entries({ repeat, timeoutMs, prepareTimeoutMs, jobs, ...(limit === undefined ? {} : { limit }) }))
    if (!Number.isSafeInteger(val) || val < 1 || (key.endsWith("Ms") && val < 1000)) throw new Error(`Invalid ${key}`);
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error("Invalid warmup");
  const input = resolve(inputArg), output = resolve(outputArg);
  const format = extname(input).toLowerCase();
  if (![".fmg", ".csv"].includes(format)) throw new Error("Input must be .fmg or housing/CE input .csv");
  if (list && (format !== ".fmg" || render || repeat !== 1 || warm || jobs !== 1 || Object.keys(overrides).length))
    throw new Error("--list requires .fmg and cannot use --render, --repeat, --warm, --jobs or --setting");
  const paths = [output, `${output}.meta.json`, ...(!list ? [`${output}.summary.json`, ...(format === ".fmg" ? [`${output}.inputs.csv`] : [])] : [])];
  for (const path of paths) {
    if (path === input) throw new Error("Output must differ from input");
    if (existsSync(path)) throw new Error(`Output exists: ${path}; choose a new output path`);
  }
  const metadata = { schemaVersion: 1, createdAt: new Date().toISOString(), input, inputHash: hashFile(input),
    codeHash: codeHash(), node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model,
    mode: list ? "list" : "measure", repeat, render, details, tokens, limit: limit ?? null, timeoutMs, prepareTimeoutMs,
    settingOverrides: overrides, warm, warmup: warm ? warmup : 0, jobs, svgDir: svgDir ?? null,
    execution: `${jobs > 1 ? `parallel-${jobs}` : "sequential"}-${warm ? "warm-process-per-job" : "fresh-process-per-run"}`,
    archiveReadMs: null, inputListHash: null };
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
  if (svgDir) mkdirSync(svgDir, { recursive: true });
  const results = [];
  const total = rows.length * repeat;
  // Runs in input order; each job takes the next one. A warm job first generates its first
  // city `warmup` times and discards those runs, and re-warms after a crash or timeout.
  const queue = rows.flatMap(row => Array.from({ length: repeat }, (_, i) => ({ row, run: i + 1 })));
  const measureOne = async (w, { row, run }) => {
    const svgPath = svgDir ? join(svgDir, `${row.burg_id}${repeat > 1 ? `-${run}` : ""}.svg`) : undefined;
    const request = { mode: "measure", row, render, overrides, svgPath };
    const measured = w ? await w.run(request, timeoutMs) : await worker(request, timeoutMs);
    const fmgTimings = Object.fromEntries(Object.entries(row).filter(([key, val]) => key.startsWith("fmg_") && key.endsWith("_ms") && val !== "" && Number.isFinite(Number(val))).map(([key, val]) => [key, Number(val)]));
    const exportTimings = Object.fromEntries(Object.entries(row).filter(([key, val]) => key.startsWith("export_") && key.endsWith("_ms") && val !== "" && Number.isFinite(Number(val))).map(([key, val]) => [key, Number(val)]));
    return { schemaVersion: 1, ...measured, generationBreakdown: measured.generationBreakdown ?? null, burgId: Number(row.burg_id), name: row.name, run,
      fmgTimings: Object.keys(fmgTimings).length ? fmgTimings : null,
      exportTimings: Object.keys(exportTimings).length ? exportTimings : null,
      fmgBreakdown: parseBreakdown(row.fmg_breakdown_json) };
  };
  const job = async index => {
    const w = warm ? new Worker() : null;
    try {
      while (queue.length && !stopping) {
        const task = queue.shift();
        if (w && !w.runs) for (let i = 0; i < warmup && !stopping; i++) {
          const warmed = await w.run({ mode: "measure", row: task.row, render, overrides }, timeoutMs);
          if (warmed.status !== "generated" && warmed.status !== "rejected") break;
        }
        if (stopping) break;
        const result = { ...(await measureOne(w, task)), job: index, ...(w ? { warmRun: w.runs } : {}) };
        appendFileSync(output, `${JSON.stringify(result)}\n`);
        results.push(result);
        writeFileSync(`${output}.summary.json`, `${JSON.stringify(summarize(results), null, 2)}\n`);
        console.error(`[ce:perf] ${results.length}/${total} burg=${task.row.burg_id} ${task.row.name} run=${task.run} ${result.status} generation=${result.timings?.generationMs === undefined ? "n/a" : `${Math.round(result.timings.generationMs)}ms`}${jobs > 1 ? ` job=${index}` : ""}`);
        if (details) {
          if (task.run === 1) printBreakdown("FMG descriptor (input export)", result.fmgBreakdown);
          printBreakdown(`CE generation run=${task.run}`, result.generationBreakdown);
        }
      }
    } finally { w?.kill(); }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, (_, i) => job(i + 1)));
  if (stopping) process.exitCode = 130;
  console.error(`[ce:perf] Wrote ${results.length} runs to ${output}`);
}
try { await main(); } catch (error) {
  console.error(`[ce:perf] ${error?.message ?? String(error)}`);
  process.exitCode = stopping ? 130 : 1;
} finally { for (const child of children) child.kill("SIGKILL"); }
