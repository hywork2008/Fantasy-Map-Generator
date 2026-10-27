/**
 * Tick growth audit (docs/plan/tick-growth-measurement.md): wall time per month, per tick label
 * (total and self), unlabeled time, heap, and yearly counts of things that grow with the years.
 * Usage: auditTickGrowth.mts <archive.fmg> <output.json> [months=48] [--cpu-profile-months=2,48] [--no-observer] [--count-every=12] [--hash-sections=<file.json>]
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Session } from "node:inspector/promises";
import { getOrCreateFaunaStockTable, getOrCreateLivestockFeedTable } from "../src/extensions/economy/context/cellTables";
import { getEconomySlice, getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getCaravans, getMarkets } from "../src/extensions/economy/context/trade";
import { getLivestockLotLedger } from "../src/extensions/economy/generators/livestockLots";
import { setTickStepObserver } from "../src/generators/tickProfiler";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";
import { hashArchiveBytes } from "../src/simulation/goldenHash";

const flags = process.argv.slice(2).filter(arg => arg.startsWith("--"));
const [input, output, length = "48"] = process.argv.slice(2).filter(arg => !arg.startsWith("--"));
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 1)
  throw new Error(
    "Usage: auditTickGrowth.mts <archive.fmg> <output.json> [months=48] [--cpu-profile-months=2,48] [--no-observer]"
  );
const noObserver = flags.includes("--no-observer");
const countEvery = Number(flags.find(flag => flag.startsWith("--count-every="))?.split("=")[1] ?? 12);
const hashOut = flags.find(flag => flag.startsWith("--hash-sections="))?.split("=")[1];
const profileMonths = new Set(
  (flags.find(flag => flag.startsWith("--cpu-profile-months="))?.split("=")[1] ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number)
);

interface LabelStats {
  calls: number;
  totalMs: number;
  selfMs: number;
}
let labels = new Map<string, LabelStats>();
let topLevelMs = 0;
let selfUnreliable = 0;
// Stack of open labels; async steps may interleave, so exits are matched by label, not position.
const stack: { label: string; start: number; childMs: number }[] = [];

function stats(label: string): LabelStats {
  let row = labels.get(label);
  if (!row) labels.set(label, (row = { calls: 0, totalMs: 0, selfMs: 0 }));
  return row;
}

/** Sizes of arrays, Maps, Sets and plain objects, one level below `value`, keyed by path. */
function sizes(value: unknown, prefix: string, out: Record<string, number>, depth: number): void {
  if (!value || typeof value !== "object" || ArrayBuffer.isView(value)) return;
  const entries: [string, unknown][] =
    value instanceof Map
      ? [...value.entries()].map(([k, v]) => [String(k), v])
      : Array.isArray(value)
        ? []
        : Object.entries(value);
  for (const [key, child] of entries) {
    const path = `${prefix}.${key}`;
    if (Array.isArray(child)) out[path] = child.length;
    else if (child instanceof Map || child instanceof Set) out[path] = child.size;
    else if (child && typeof child === "object" && !ArrayBuffer.isView(child)) {
      out[path] = Object.keys(child).length;
      if (depth > 1) sizes(child, path, out, depth - 1);
    }
  }
}

function counts(month: number) {
  const world = getWorldContext();
  const markets = getMarkets();
  // Per-market arrays and maps (ledgers, histories): sum and largest over markets.
  const ledgerSum: Record<string, number> = {};
  const ledgerMax: Record<string, number> = {};
  for (const market of markets) {
    const row: Record<string, number> = {};
    sizes(market, "market", row, 2);
    for (const [key, size] of Object.entries(row)) {
      ledgerSum[key] = (ledgerSum[key] ?? 0) + size;
      ledgerMax[key] = Math.max(ledgerMax[key] ?? 0, size);
    }
  }
  const economySlice: Record<string, number> = {};
  sizes(getEconomySlice(), "economy", economySlice, 1);
  // Livestock lot ledger (tick-growth-20261028: its full scans dominate late months).
  const lotLedger = getLivestockLotLedger();
  const lots = Object.values(lotLedger?.lots ?? {});
  const livestockLots = {
    lots: lots.length,
    byStatus: lots.reduce<Record<string, number>>((acc, lot) => ((acc[lot.status] = (acc[lot.status] ?? 0) + 1), acc), {}),
    tinyLots: lots.filter(lot => lot.heads < 1e-3).length,
    shipments: Object.keys(lotLedger?.shipments ?? {}).length,
    exitKeys: Object.keys(lotLedger?.exits ?? {}).length,
    nextId: lotLedger?.nextId ?? 0
  };
  return {
    month,
    burgs: (world.pack.burgs ?? []).filter(burg => burg && burg.i && !burg.removed).length,
    markets: markets.length,
    caravans: getCaravans().length,
    faunaRows: Object.keys(getOrCreateFaunaStockTable() ?? {}).length,
    feedRows: Object.keys(getOrCreateLivestockFeedTable() ?? {}).length,
    ledgers: { sum: ledgerSum, max: ledgerMax },
    economySlice,
    livestockLots
  };
}

let sourceCommit = "";
let sourceDirty = false;
try {
  sourceCommit = execSync("git rev-parse HEAD").toString().trim();
  sourceDirty = execSync("git status --porcelain").toString().trim().length > 0;
} catch {}

const bytes = readFileSync(input);
const host = createNodeSimulationHost();
const monthRows: unknown[] = [];
const countRows: unknown[] = [];
const profiles: { month: number; path: string; sha256: string }[] = [];
const started = performance.now();
let finalHash = "";
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  const sim = host.simulation as { worldSettings?: Record<string, string> };
  sim.worldSettings = { ...sim.worldSettings, "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" };
  if (!noObserver)
    setTickStepObserver({
      enter(label) {
        stack.push({ label, start: performance.now(), childMs: 0 });
      },
      exit(label) {
        const now = performance.now();
        let index = stack.length - 1;
        while (index >= 0 && stack[index].label !== label) index--;
        if (index < 0) return;
        const [frame] = stack.splice(index, 1);
        const total = now - frame.start;
        const row = stats(label);
        row.calls++;
        row.totalMs += total;
        if (index === stack.length) row.selfMs += total - frame.childMs;
        else selfUnreliable++;
        if (index > 0) stack[index - 1].childMs += total;
        else topLevelMs += total;
      }
    });
  if (!noObserver) countRows.push(counts(0));
  const session = profileMonths.size ? new Session() : null;
  session?.connect();
  for (let month = 1; month <= months; month++) {
    labels = new Map();
    topLevelMs = 0;
    const profiling = session && profileMonths.has(month);
    if (profiling) {
      await session.post("Profiler.enable");
      await session.post("Profiler.start");
    }
    const monthStart = performance.now();
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    const wallMs = performance.now() - monthStart;
    if (profiling) {
      const { profile } = await session.post("Profiler.stop");
      const text = JSON.stringify(profile);
      const path = `docs/analytics/raw/tick-growth-${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}-m${month}.cpuprofile`;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      profiles.push({ month, path, sha256: createHash("sha256").update(text).digest("hex") });
    }
    const memory = process.memoryUsage();
    monthRows.push({
      month,
      wallMs,
      elapsedMs: performance.now() - started,
      heapUsed: memory.heapUsed,
      rss: memory.rss,
      unlabeledMs: noObserver ? null : wallMs - topLevelMs,
      labels: Object.fromEntries([...labels].sort((a, b) => b[1].selfMs - a[1].selfMs))
    });
    if (!noObserver && (month === 1 || month % countEvery === 0 || month === months)) countRows.push(counts(month));
    console.error(
      `[tick-growth] ${new Date().toISOString().slice(0, 19)} ${month}/${months} wall=${Math.round(wallMs / 1000)}s heap=${Math.round(memory.heapUsed / 2 ** 20)}MB`
    );
  }
  session?.disconnect();
  const report = await hashArchiveBytes(await host.saveArchive());
  finalHash = report.digest;
  if (hashOut) writeFileSync(hashOut, `${JSON.stringify(report, null, 1)}\n`);
  console.error(`[tick-growth] golden=${finalHash}`);
} finally {
  setTickStepObserver(null);
  host.dispose();
}

// Early (months 1-12) vs late (last 12 months) cost per month, by label.
type MonthRow = { month: number; labels: Record<string, LabelStats>; unlabeledMs: number | null; wallMs: number };
const rows = monthRows as MonthRow[];
const window = Math.min(12, Math.floor(rows.length / 2)) || 1;
const early = rows.slice(0, window);
const late = rows.slice(-window);
const mean = (list: MonthRow[], pick: (row: MonthRow) => number) => list.reduce((s, r) => s + pick(r), 0) / list.length;
const names = new Set(rows.flatMap(row => Object.keys(row.labels)));
const growth = [...names, "(unlabeled)", "(month)"]
  .map(label => {
    const pick = (field: "selfMs" | "totalMs") => (row: MonthRow) =>
      label === "(unlabeled)" ? (row.unlabeledMs ?? 0) : label === "(month)" ? row.wallMs : (row.labels[label]?.[field] ?? 0);
    const earlySelf = mean(early, pick("selfMs"));
    const lateSelf = mean(late, pick("selfMs"));
    return {
      label,
      earlySelfMs: earlySelf,
      lateSelfMs: lateSelf,
      earlyTotalMs: mean(early, pick("totalMs")),
      lateTotalMs: mean(late, pick("totalMs")),
      selfRatio: earlySelf > 0 ? lateSelf / earlySelf : null,
      lateSelfIncreaseMs: lateSelf - earlySelf
    };
  })
  .sort((a, b) => b.lateSelfIncreaseMs - a.lateSelfIncreaseMs);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      inputSha256: createHash("sha256").update(bytes).digest("hex"),
      sourceCommit,
      sourceDirty,
      monthsRun: months,
      observer: !noObserver,
      worldSettings: { "fmg-long-distance-trade": "on", "fmg-caravan-raids": "off" },
      node: process.version,
      goldenDigest: finalHash,
      selfUnreliable,
      cpuProfiles: profiles,
      growth,
      counts: countRows,
      months: monthRows
    },
    null,
    1
  )}\n`
);
