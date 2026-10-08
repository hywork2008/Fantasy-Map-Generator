#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { arch, cpus, platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const usage = `Usage: npm run fmg:perf -- <report.jsonl> [--seed 1,2,3] [--repeat 3] [--mode load|regenerate]
         [--extensions none|default|economy,nobility,...] [--width 1920] [--height 1080]
         [--local-storage settings.json] [--server dev|preview | --url http://host/Fantasy-Map-Generator/]
         [--budget-ms 2000] [--details] [--timeout-ms 180000] [--headed]
       npm run fmg:perf -- --compare <before.jsonl> <after.jsonl> [--depth 3]`;
const EXTENSION_IDS = ["economy", "characters", "nobility", "shipbuilding"];
const DEFAULT_SEEDS = ["100000001", "200000002", "300000003"];
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(usage);
  process.exit(0);
}
let stopping = false;
let cleanup = async () => {};
process.on("SIGINT", () => {
  stopping = true;
});

const log = message => console.error(`[fmg:perf] ${message}`);
function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function codeHash() {
  const hash = createHash("sha256");
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "city-generator") visit(path);
      else if (/\.(ts|tsx|js|css|html)$/.test(entry.name) && !/\.test\./.test(entry.name))
        hash.update(path.slice(root.length)).update(readFileSync(path));
    }
  };
  visit(join(root, "src"));
  for (const path of ["scripts/benchmarkFmgGeneration.mjs", "vite.config.ts", "package-lock.json"])
    hash.update(path).update(readFileSync(join(root, path)));
  return hash.digest("hex");
}
function git(...gitArgs) {
  try {
    return execFileSync("git", gitArgs, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const n = sorted.length;
  return {
    count: n,
    min: sorted[0],
    median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    mean: sorted.reduce((a, b) => a + b, 0) / n,
    p95: sorted[Math.ceil(n * 0.95) - 1],
    max: sorted[n - 1]
  };
}
const fmt = ms => (Number.isFinite(ms) ? ms.toFixed(1) : "n/a");

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}
async function waitForHttp(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Server did not answer ${url} within ${timeoutMs} ms`);
}
/** Serves the working tree on a private port, so a developer's own dev server and HMR edits are not measured. */
async function startServer(mode) {
  const vite = join(root, "node_modules/.bin/vite");
  const port = await freePort();
  let serveArgs = ["--port", String(port), "--strictPort", "--host", "127.0.0.1"];
  let buildMs = null;
  if (mode === "preview") {
    const outDir = join(tmpdir(), `fmg-perf-build-${process.pid}`);
    log(`Building production bundle into ${outDir}`);
    const started = performance.now();
    execFileSync(vite, ["build", "--outDir", outDir, "--emptyOutDir", "--logLevel", "warn"], {
      cwd: root,
      stdio: ["ignore", "ignore", "inherit"]
    });
    buildMs = performance.now() - started;
    serveArgs = ["preview", "--outDir", outDir, ...serveArgs];
  }
  const child = spawn(vite, serveArgs, { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", chunk => {
    stderr = (stderr + chunk).slice(-4000);
  });
  const url = `http://127.0.0.1:${port}/Fantasy-Map-Generator/`;
  try {
    await waitForHttp(url, child, 120000);
  } catch (error) {
    child.kill("SIGKILL");
    throw new Error(`${error.message}\n${stderr}`);
  }
  return { url, buildMs, stop: () => child.kill("SIGTERM") };
}

/** localStorage applied before any app script runs. */
function initialStorage(extensions, overrides) {
  const enabled = Object.fromEntries(
    EXTENSION_IDS.map(id => [id, extensions === "default" ? true : extensions.includes(id)])
  );
  return {
    debug: JSON.stringify({ generationProfile: true }),
    "fmg-extensions": JSON.stringify({ state: { enabledExtensions: enabled }, version: 0 }),
    ...overrides
  };
}

/**
 * Waits in the page for the recording after `afterId` to finish. The Build map review dialog is
 * continued with "Generate entire map" as a user would; that wait is recorded as review-wait.
 */
function waitForProfile(page, afterId, timeoutMs) {
  return page.evaluate(
    ({ afterId, timeoutMs }) =>
      new Promise(resolveProfile => {
        const deadline = performance.now() + timeoutMs;
        const poll = () => {
          const profile = window.fmg?.actions.getGenerationProfile();
          if (profile && profile.id > afterId) {
            const { marks } = profile;
            if ("failed" in marks) return resolveProfile({ status: "failed", profile });
            if ("map-ready" in marks && "coordinator-rendered" in marks)
              return resolveProfile({ status: "generated", profile });
          }
          const button = [...document.querySelectorAll("button")].find(b => b.textContent === "Generate entire map");
          if (button && !button.disabled) button.click();
          if (performance.now() > deadline) return resolveProfile({ status: "timeout", profile });
          setTimeout(poll, 10);
        };
        poll();
      }),
    { afterId, timeoutMs }
  );
}

/** Deterministic digest of generated data. Equal digests mean a refactor kept the same map. */
function captureWorld(page) {
  return page.evaluate(async () => {
    const { world } = window.fmg;
    const { pack } = world;
    const r3 = v => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);
    const arr = v => (v ? Array.from(v) : null);
    const parts = {
      heights: [arr(pack.cells.h), arr(world.grid.cells.h)],
      features: [arr(pack.cells.f), pack.features?.map(f => f && [f.type, f.cells, f.land])],
      climate: [arr(world.grid.cells.temp), arr(world.grid.cells.prec)],
      rivers: [arr(pack.cells.r), arr(pack.cells.fl), pack.rivers?.map(r => [r.i, r.source, r.mouth, r.parent, r.name])],
      biomes: arr(pack.cells.biome),
      population: arr(pack.cells.pop),
      cultures: [arr(pack.cells.culture), pack.cultures?.map(c => c && [c.i, c.name, c.center])],
      burgs: pack.burgs?.map(b => b && [b.i, b.cell, r3(b.x), r3(b.y), r3(b.population), b.state, b.name, b.port]),
      states: [arr(pack.cells.state), pack.states?.map(s => s && [s.i, s.name, s.capital, s.form])],
      routes: pack.routes?.map(r => [r.group, r.points?.map(p => p.map(r3))]),
      religions: arr(pack.cells.religion),
      provinces: [arr(pack.cells.province), pack.provinces?.map(p => p && [p.i, p.name, p.burg])],
      markers: pack.markers?.map(m => [m.type, m.cell, r3(m.x), r3(m.y)]),
      zones: pack.zones?.map(z => [z.type, z.cells])
    };
    const digest = async value => {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    };
    const fingerprints = {};
    for (const [key, value] of Object.entries(parts)) fingerprints[key] = await digest(value);
    const live = list => (list ?? []).filter(item => item && item.i && !item.removed).length;
    return {
      fingerprint: await digest(fingerprints),
      fingerprints,
      counts: {
        gridCells: world.grid.cells.i?.length ?? 0,
        packCells: pack.cells.i?.length ?? 0,
        rivers: pack.rivers?.length ?? 0,
        cultures: live(pack.cultures),
        burgs: live(pack.burgs),
        states: live(pack.states),
        routes: pack.routes?.length ?? 0,
        provinces: live(pack.provinces),
        markers: pack.markers?.length ?? 0
      },
      graph: { width: world.graphWidth, height: world.graphHeight },
      settlementPattern: world.options.initialSettlementPattern
    };
  });
}

/** Headline numbers from one recording; review-wait is user think time and is removed. */
function metrics(profile) {
  const timings = profile.timings;
  const entry = profile.entry;
  const find = path => timings.find(t => t.path === path);
  const reviewWaitMs = timings.filter(t => t.path.endsWith("/review-wait")).reduce((sum, t) => sum + t.elapsedMs, 0);
  const pipeline = `${entry}/generation/world-runtime`;
  const stages = Object.fromEntries(
    timings.filter(t => t.parent === pipeline && t.path !== `${pipeline}/review-wait`).map(t => [t.path.split("/").at(-1), t.elapsedMs])
  );
  const marks = profile.marks;
  const readyAt = Math.max(marks["map-ready"] ?? Number.NaN, marks["coordinator-rendered"] ?? Number.NaN);
  return {
    totalMs: readyAt - reviewWaitMs,
    generatedMs: (marks.generated ?? Number.NaN) - reviewWaitMs,
    drawnMs: (marks.drawn ?? Number.NaN) - reviewWaitMs,
    generationMs: (find(`${entry}/generation`)?.elapsedMs ?? Number.NaN) - reviewWaitMs,
    pipelineMs: (find(pipeline)?.elapsedMs ?? Number.NaN) - reviewWaitMs,
    entryDrawMs: find(`${entry}/drawLayers`)?.elapsedMs ?? null,
    coordinatorRenderMs: find("coordinator-render")?.elapsedMs ?? null,
    mapReadyWaitMs: Number.isFinite(marks["map-ready"]) && Number.isFinite(marks["map-ready-start"])
      ? marks["map-ready"] - marks["map-ready-start"]
      : null,
    reviewWaitMs,
    stages
  };
}

/** Depth-first order; siblings keep the order in which they were first entered. */
function treeOrder(timings) {
  const children = new Map();
  for (const t of timings) {
    const list = children.get(t.parent) ?? [];
    list.push(t);
    children.set(t.parent, list);
  }
  const ordered = [];
  const visit = parent => {
    for (const t of children.get(parent) ?? []) {
      ordered.push(t);
      visit(t.path);
    }
  };
  visit(null);
  return ordered;
}

function printTree(label, timings, maxDepth = Infinity) {
  if (!timings?.length) return;
  console.error(`[fmg:perf] ${label} — inclusive(ms) / self(ms) / calls`);
  for (const t of treeOrder(timings)) {
    if (t.depth > maxDepth) continue;
    console.error(
      `  ${t.elapsedMs.toFixed(1).padStart(10)} / ${t.selfMs.toFixed(1).padStart(10)} / ${String(t.calls).padStart(5)}  ${"  ".repeat(t.depth)}${t.path.split("/").at(-1)}`
    );
  }
}

function summarizeBreakdown(results) {
  const order = [];
  const byPath = new Map();
  for (const result of results)
    for (const t of result.breakdown ?? []) {
      if (!byPath.has(t.path)) {
        byPath.set(t.path, []);
        order.push(t);
      }
      byPath.get(t.path).push(t);
    }
  return treeOrder(order).map(({ path, parent, depth }) => {
    const list = byPath.get(path);
    return {
      path,
      parent,
      depth,
      runs: list.length,
      elapsedMs: stats(list.map(t => t.elapsedMs)),
      selfMs: stats(list.map(t => t.selfMs)),
      calls: stats(list.map(t => t.calls))
    };
  });
}

function summarize(results, budgetMs) {
  const statuses = {};
  for (const r of results) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
  const ok = results.filter(r => r.status === "generated");
  const metricStats = rows => {
    const keys = ["totalMs", "generatedMs", "drawnMs", "generationMs", "pipelineMs", "entryDrawMs", "coordinatorRenderMs", "mapReadyWaitMs"];
    const out = Object.fromEntries(keys.map(key => [key, stats(rows.map(r => r.metrics[key]))]));
    const stageNames = [...new Set(rows.flatMap(r => Object.keys(r.metrics.stages)))];
    out.stages = Object.fromEntries(stageNames.map(name => [name, stats(rows.map(r => r.metrics.stages[name]))]));
    return out;
  };
  const seeds = [...new Set(results.map(r => r.seed))].map(seed => {
    const rows = ok.filter(r => r.seed === seed);
    const fingerprints = [...new Set(rows.map(r => r.world.fingerprint))];
    return {
      seed,
      runs: results.filter(r => r.seed === seed).length,
      generated: rows.length,
      deterministic: fingerprints.length <= 1,
      fingerprints,
      counts: rows[0]?.world.counts ?? null,
      metrics: metricStats(rows)
    };
  });
  const overall = metricStats(ok);
  return {
    schemaVersion: 1,
    totalRuns: results.length,
    statuses,
    budgetMs,
    withinBudget: budgetMs && overall.totalMs ? overall.totalMs.median <= budgetMs : null,
    overall,
    seeds,
    breakdown: summarizeBreakdown(ok)
  };
}

function readReport(path) {
  const results = readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
  if (!results.length) throw new Error(`Empty report: ${path}`);
  return results;
}

/** Medians side by side; fingerprints must match per seed for a behavior-preserving refactor. */
function compare(beforePath, afterPath, maxDepth) {
  const before = readReport(resolve(beforePath)).filter(r => r.status === "generated");
  const after = readReport(resolve(afterPath)).filter(r => r.status === "generated");
  const [b, a] = [summarize(before, null), summarize(after, null)];
  const line = (label, x, y) => {
    const delta = Number.isFinite(x) && Number.isFinite(y) ? y - x : Number.NaN;
    const pct = Number.isFinite(delta) && x ? `${delta >= 0 ? "+" : ""}${((delta / x) * 100).toFixed(1)}%` : "";
    console.log(`${fmt(x).padStart(10)} ${fmt(y).padStart(10)} ${(Number.isFinite(delta) ? `${delta >= 0 ? "+" : ""}${fmt(delta)}` : "").padStart(10)} ${pct.padStart(8)}  ${label}`);
  };
  console.log(`${"before".padStart(10)} ${"after".padStart(10)} ${"delta".padStart(10)} ${"".padStart(8)}  median ms`);
  for (const key of ["totalMs", "generatedMs", "generationMs", "pipelineMs", "entryDrawMs", "coordinatorRenderMs"])
    line(key, b.overall[key]?.median, a.overall[key]?.median);
  for (const name of Object.keys({ ...b.overall.stages, ...a.overall.stages }))
    line(`stage ${name}`, b.overall.stages[name]?.median, a.overall.stages[name]?.median);
  console.log("\nbreakdown (inclusive median)");
  const afterByPath = new Map(a.breakdown.map(t => [t.path, t]));
  const seen = new Set();
  for (const t of [...b.breakdown, ...a.breakdown]) {
    if (seen.has(t.path) || t.depth > maxDepth) continue;
    seen.add(t.path);
    const x = b.breakdown.find(row => row.path === t.path)?.elapsedMs?.median;
    line(`${"  ".repeat(t.depth)}${t.path.split("/").at(-1)}`, x, afterByPath.get(t.path)?.elapsedMs?.median);
  }
  console.log("\noutput fingerprints");
  let mismatch = false;
  for (const seed of new Set([...b.seeds, ...a.seeds].map(s => s.seed))) {
    const x = b.seeds.find(s => s.seed === seed);
    const y = a.seeds.find(s => s.seed === seed);
    if (!x || !y) {
      console.log(`  seed ${seed}: only in ${x ? "before" : "after"}`);
      continue;
    }
    const same = x.fingerprints.length === 1 && y.fingerprints.length === 1 && x.fingerprints[0] === y.fingerprints[0];
    if (!same) {
      mismatch = true;
      const xr = before.find(r => r.seed === seed).world.fingerprints;
      const yr = after.find(r => r.seed === seed).world.fingerprints;
      const changed = Object.keys({ ...xr, ...yr }).filter(key => xr[key] !== yr[key]);
      console.log(`  seed ${seed}: CHANGED (${changed.join(", ") || "run-to-run variation"})`);
    } else console.log(`  seed ${seed}: identical`);
  }
  const env = r => [r.mode, r.extensions.join(",") || "none", r.server, `${r.viewport.width}x${r.viewport.height}`].join(" ");
  if (env(before[0]) !== env(after[0])) console.log(`\nWARNING: different conditions: ${env(before[0])} vs ${env(after[0])}`);
  if (mismatch) process.exitCode = 2;
}

async function measure(page, mode, seed, timeoutMs, baseUrl, viewport) {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  let afterId = 0;
  if (mode === "load") {
    const url = new URL(baseUrl);
    url.searchParams.set("seed", seed);
    url.searchParams.set("width", String(viewport.width));
    url.searchParams.set("height", String(viewport.height));
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForFunction(() => window.fmg?.actions?.getGenerationProfile, null, { timeout: timeoutMs });
  } else {
    afterId = (await page.evaluate(() => window.fmg.actions.getGenerationProfile()?.id)) ?? 0;
    await page.evaluate(s => window.fmg.actions.regenerateMap({ seed: s }), seed);
  }
  const { status, profile } = await waitForProfile(page, afterId, timeoutMs);
  if (!profile) return { status: status === "timeout" ? "timeout" : "error", pageErrors, error: "No generation profile was recorded" };
  if (!profile.marks.generated) return { status, pageErrors, breakdown: profile.timings, marks: profile.marks };
  return {
    status,
    pageErrors,
    metrics: metrics(profile),
    marks: profile.marks,
    breakdown: profile.timings,
    world: await captureWorld(page)
  };
}

async function main() {
  if (args[0] === "--compare") {
    const [, beforePath, afterPath, ...rest] = args;
    if (!beforePath || !afterPath) throw new Error(usage);
    const depthIndex = rest.indexOf("--depth");
    compare(beforePath, afterPath, depthIndex >= 0 ? Number(rest[depthIndex + 1]) : 3);
    return;
  }
  const outputArg = args.shift();
  if (!outputArg || outputArg.startsWith("--")) throw new Error(usage);
  let seeds = DEFAULT_SEEDS;
  let repeat = 3;
  let mode = "load";
  let extensions = [];
  let width = 1920;
  let height = 1080;
  let storageFile;
  let serverMode = "dev";
  let externalUrl;
  let budgetMs = 2000;
  let details = false;
  let timeoutMs = 180000;
  let headed = false;
  const value = flag => {
    const val = args.shift();
    if (!val || val.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    return val;
  };
  while (args.length) {
    const flag = args.shift();
    if (flag === "--seed") seeds = value(flag).split(",");
    else if (flag === "--repeat") repeat = Number(value(flag));
    else if (flag === "--mode") mode = value(flag);
    else if (flag === "--extensions") {
      const val = value(flag);
      extensions = val === "none" ? [] : val === "default" ? "default" : val.split(",");
    } else if (flag === "--width") width = Number(value(flag));
    else if (flag === "--height") height = Number(value(flag));
    else if (flag === "--local-storage") storageFile = resolve(value(flag));
    else if (flag === "--server") serverMode = value(flag);
    else if (flag === "--url") externalUrl = value(flag);
    else if (flag === "--budget-ms") budgetMs = Number(value(flag));
    else if (flag === "--details") details = true;
    else if (flag === "--timeout-ms") timeoutMs = Number(value(flag));
    else if (flag === "--headed") headed = true;
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!["load", "regenerate"].includes(mode)) throw new Error("--mode must be load or regenerate");
  if (!["dev", "preview"].includes(serverMode)) throw new Error("--server must be dev or preview");
  if (Array.isArray(extensions) && extensions.some(id => !EXTENSION_IDS.includes(id)))
    throw new Error(`--extensions accepts none, default or ${EXTENSION_IDS.join(",")}`);
  if (seeds.some(seed => !/^\d+$/.test(seed))) throw new Error("--seed requires numeric seeds separated by commas");
  for (const [key, val] of Object.entries({ repeat, width, height, budgetMs, timeoutMs }))
    if (!Number.isSafeInteger(val) || val < 1) throw new Error(`Invalid ${key}`);
  const overrides = storageFile ? JSON.parse(readFileSync(storageFile, "utf8")) : {};
  if (typeof overrides !== "object" || Array.isArray(overrides) || Object.values(overrides).some(v => typeof v !== "string"))
    throw new Error("--local-storage must be a JSON object of string values");

  const output = resolve(outputArg);
  for (const path of [output, `${output}.summary.json`, `${output}.meta.json`])
    if (existsSync(path)) throw new Error(`Output exists: ${path}; choose a new output path`);

  const server = externalUrl ? { url: externalUrl, buildMs: null, stop: () => {} } : await startServer(serverMode);
  const browser = await chromium.launch({ headless: !headed });
  cleanup = async () => {
    await browser.close().catch(() => {});
    server.stop();
  };
  const viewport = { width, height };
  const storage = initialStorage(extensions, overrides);
  const extensionList = extensions === "default" ? [...EXTENSION_IDS] : extensions;
  const metadata = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    gitHead: git("rev-parse", "HEAD"),
    gitDirty: Boolean(git("status", "--porcelain", "--untracked-files=no")),
    codeHash: codeHash(),
    node: process.version,
    browser: `chromium ${browser.version()}`,
    headless: !headed,
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    mode,
    seeds,
    repeat,
    extensions: extensionList,
    viewport,
    server: externalUrl ? `url:${externalUrl}` : serverMode,
    buildMs: server.buildMs,
    localStorage: overrides,
    localStorageFileHash: storageFile ? hashFile(storageFile) : null,
    budgetMs,
    timeoutMs,
    execution: mode === "load" ? "fresh-browser-context-per-run" : "one-context-per-seed-after-warmup-load"
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(`${output}.meta.json`, `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx" });
  writeFileSync(output, "", { flag: "wx" });

  const newContext = async () => {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(entries => {
      for (const [key, val] of Object.entries(entries)) localStorage.setItem(key, val);
    }, storage);
    return context;
  };
  const results = [];
  const total = seeds.length * repeat;
  const record = (seed, run, measured, context) => {
    const result = {
      schemaVersion: 1,
      seed,
      run,
      mode,
      extensions: extensionList,
      viewport,
      server: metadata.server,
      ...measured,
      context
    };
    appendFileSync(output, `${JSON.stringify(result)}\n`);
    results.push(result);
    writeFileSync(`${output}.summary.json`, `${JSON.stringify(summarize(results, budgetMs), null, 2)}\n`);
    const m = result.metrics;
    log(
      `${results.length}/${total} seed=${seed} run=${run} ${result.status}` +
        (m ? ` total=${fmt(m.totalMs)}ms generation=${fmt(m.generationMs)}ms draw=${fmt(m.entryDrawMs)}+${fmt(m.coordinatorRenderMs)}ms` : "") +
        (result.pageErrors?.length ? ` pageErrors=${result.pageErrors.length}` : "")
    );
    if (details && result.breakdown) printTree(`seed=${seed} run=${run}`, result.breakdown);
  };

  for (const seed of seeds) {
    if (stopping) break;
    if (mode === "load") {
      for (let run = 1; run <= repeat && !stopping; run++) {
        const context = await newContext();
        const page = await context.newPage();
        try {
          record(seed, run, await measure(page, "load", seed, timeoutMs, server.url, viewport), "fresh");
        } catch (error) {
          record(seed, run, { status: "error", error: error?.message ?? String(error) }, "fresh");
        } finally {
          await context.close();
        }
      }
    } else {
      const context = await newContext();
      const page = await context.newPage();
      try {
        const warmup = await measure(page, "load", seed, timeoutMs, server.url, viewport);
        if (warmup.status !== "generated") throw new Error(`Warm-up load ${warmup.status}`);
        for (let run = 1; run <= repeat && !stopping; run++)
          record(seed, run, await measure(page, "regenerate", seed, timeoutMs, server.url, viewport), "warm");
      } catch (error) {
        record(seed, 0, { status: "error", error: error?.message ?? String(error) }, "warm");
      } finally {
        await context.close();
      }
    }
  }
  const summary = summarize(results, budgetMs);
  if (details) printTree("median of generated runs", summary.breakdown.map(t => ({ ...t, elapsedMs: t.elapsedMs.median, selfMs: t.selfMs.median, calls: t.calls.median })));
  const o = summary.overall;
  log(`median total=${fmt(o.totalMs?.median)}ms generation=${fmt(o.generationMs?.median)}ms (budget ${budgetMs}ms: ${summary.withinBudget ? "within" : "OVER"})`);
  for (const seed of summary.seeds) if (!seed.deterministic) log(`seed=${seed.seed} produced ${seed.fingerprints.length} different maps across runs`);
  log(`Wrote ${results.length} runs to ${output}`);
  if (stopping) process.exitCode = 130;
}

try {
  await main();
} catch (error) {
  log(error?.message ?? String(error));
  process.exitCode = stopping ? 130 : 1;
} finally {
  await cleanup();
}
