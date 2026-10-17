#!/usr/bin/env tsx
/**
 * Approach Traffic Observatory runner (docs/plan/approach-traffic-observatory.md §3, §8).
 *
 *   npm run observe -- run <experiment.json> [--server http://127.0.0.1:8788] [--token T] [--out data/observatory]
 *   npm run observe -- report <runId | run dir> [--out data/observatory]
 *
 * run     publishes every map of the experiment as a sim:server channel, advances it with in-worker
 *         sampling and copies the samples to data/observatory/<runId>/. Without --server a private
 *         sim:server is started on a free port with its channels under the run directory.
 * report  derives the per-period flows (§7.1) and writes approaches.csv, routes.csv, corridors.csv
 *         and report.html next to the samples.
 */
import { type ChildProcess, execFileSync, fork, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { basename, join, resolve } from "node:path";
import { buildReport } from "./lib/observeReport.mts";

const root = resolve(import.meta.dirname, "..");
const log = (message: string) => console.error(`[observe] ${message}`);

interface MapSpec {
  kind: "new" | "file" | "channel";
  seeds?: (number | string)[];
  options?: Record<string, string | number | boolean>;
  path?: string;
  id?: string;
  fork?: boolean;
}

interface Experiment {
  id: string;
  maps: MapSpec[];
  extensions?: string[];
  timeline?: "continue" | "new";
  warmup?: { years?: number; months?: number };
  advance: { years?: number; months?: number; days?: number; sampleEvery?: { months: number } };
  sampleDetail?: string;
  ceProbe?: CeProbe;
  workers?: number;
}

/** §7.2: `at` is an offset from the start of the sampled advance ("+0", "+6m", "+2y"). */
interface CeProbe {
  at: string[];
  burgs?: { topByPopulation?: number; ids?: number[] };
}

function offsetMonths(text: string): number {
  const match = /^\+?(\d+)([ym]?)$/.exec(text.trim());
  if (!match) throw new Error(`ceProbe.at '${text}' must look like +2y or +6m`);
  return Number(match[1]) * (match[2] === "y" ? 12 : 1);
}

/** Runs the CE probe on a copy of the world, never on the running channel (§10). */
function probeSnapshot(snapshot: string, burgIds: number[], out: string): Promise<void> {
  const args = ["--import", "tsx", join(root, "scripts/observeCeProbe.mjs"), snapshot, burgIds.join(","), out];
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: ["ignore", "ignore", "ignore"] });
    child.on("error", fail);
    child.on("exit", code => (code === 0 ? done() : fail(new Error(`CE probe exited with ${code}`))));
  });
}

const DEFAULT_EXTENSIONS = ["economy", "characters", "nobility", "shipbuilding"];

/** Defaults that let states and population form (AGENTS.md: Fantasy sets fall back to Marches). */
const NEW_MAP_DEFAULTS: Record<string, string> = { culturesSet: "european", initialSettlementPattern: "standard" };

function parseArgs(argv: string[]) {
  const [command, target, ...rest] = argv;
  const flag = (name: string) => {
    const at = rest.indexOf(`--${name}`);
    return at < 0 ? undefined : rest[at + 1];
  };
  if (!command || !target || !["run", "report"].includes(command)) {
    console.log(
      "Usage: npm run observe -- run <experiment.json> [--server URL] [--token T] [--out dir]\n       npm run observe -- report <runId|dir> [--out dir]"
    );
    process.exit(command ? 1 : 0);
  }
  return {
    command: command as "run" | "report",
    target,
    server: flag("server"),
    token: flag("token") ?? process.env.FMG_SIM_TOKEN ?? "",
    out: resolve(flag("out") ?? join(root, "data/observatory"))
  };
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => done(port));
    });
  });
}

async function startPrivateServer(dataDir: string): Promise<{ url: string; child: ChildProcess }> {
  const port = await freePort();
  const child = fork(join(root, "scripts/simServer.mts"), ["--port", String(port), "--data", dataDir], {
    execArgv: ["--import", "tsx"],
    stdio: ["ignore", "inherit", "inherit", "ipc"]
  });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${url}/api/sim/health`)).ok) return { url, child };
    } catch {
      /* not listening yet */
    }
    await new Promise(done => setTimeout(done, 100));
  }
  child.kill();
  throw new Error("sim:server did not start");
}

function client(server: string, token: string) {
  const headers = (extra: Record<string, string> = {}) => ({ ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra });
  async function request(method: string, path: string, body?: BodyInit, contentType?: string) {
    const response = await fetch(`${server}/api/sim${path}`, {
      method,
      body,
      headers: headers(contentType ? { "Content-Type": contentType } : {})
    });
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return response;
  }
  return {
    json: async (method: string, path: string, body?: unknown) =>
      (await request(method, path, body === undefined ? undefined : JSON.stringify(body), "application/json")).json(),
    bytes: async (path: string) => new Uint8Array(await (await request("GET", path)).arrayBuffer()),
    text: async (path: string) => (await request("GET", path)).text(),
    publish: async (archive: Uint8Array, query: Record<string, string>) =>
      (await request("POST", `/channels?${new URLSearchParams(query)}`, archive, "application/octet-stream")).json()
  };
}

/** Generates one new map with the headless browser generator (`npm run fmg:small`). */
function generateMap(
  seed: string,
  options: Record<string, string | number | boolean>,
  mapsDir: string,
  extensions: readonly string[]
): Uint8Array {
  const { scope = "province", cells, ...storage } = options;
  const entries = {
    ...NEW_MAP_DEFAULTS,
    ...Object.fromEntries(Object.entries(storage).map(([k, v]) => [k, String(v)])),
    // Extensions are off in a fresh browser profile; without this the map has no economy to observe.
    "fmg-extensions": JSON.stringify({
      state: { enabledExtensions: Object.fromEntries(extensions.map(id => [id, true])) },
      version: 0
    })
  };
  const storageFile = join(mapsDir, `storage-${seed}.json`);
  writeFileSync(storageFile, JSON.stringify(entries, null, 2));
  const args = [join(root, "scripts/generateSmallMaps.mjs"), mapsDir, "--seed", seed, "--scope", String(scope), "--local-storage", storageFile, "--wait-extensions"];
  if (cells !== undefined) args.push("--cells", String(cells));
  log(`generating seed ${seed} (${scope})`);
  execFileSync(process.execPath, args, { stdio: ["ignore", "inherit", "inherit"] });
  const file = join(mapsDir, `${scope}-${seed}.fmg`);
  if (!existsSync(file)) throw new Error(`seed ${seed} produced no map (see fmg:small output)`);
  return new Uint8Array(readFileSync(file));
}

interface Job {
  label: string;
  source: () => Promise<Uint8Array> | Uint8Array;
  /** Advance this existing channel in place instead of publishing a copy. */
  channel?: string;
}

function jobsOf(experiment: Experiment, api: ReturnType<typeof client>, mapsDir: string, haveExternalServer: boolean): Job[] {
  const jobs: Job[] = [];
  for (const map of experiment.maps) {
    if (map.kind === "new") {
      for (const seed of map.seeds ?? []) jobs.push({ label: `seed-${seed}`, source: () => generateMap(String(seed), map.options ?? {}, mapsDir, experiment.extensions ?? DEFAULT_EXTENSIONS)
        });
    } else if (map.kind === "file") {
      if (!map.path) throw new Error("file map needs path");
      const path = resolve(map.path);
      jobs.push({ label: basename(path, ".fmg"), source: () => new Uint8Array(readFileSync(path)) });
    } else if (map.kind === "channel") {
      if (!map.id) throw new Error("channel map needs id");
      if (!haveExternalServer) throw new Error(`channel '${map.id}' needs --server`);
      const id = map.id;
      if (map.fork === false) jobs.push({ label: id, source: () => new Uint8Array(), channel: id });
      else jobs.push({ label: id, source: () => api.bytes(`/channels/${id}/archive`) });
    } else throw new Error(`Unknown map kind '${(map as MapSpec).kind}'`);
  }
  return jobs;
}

async function runExperiment(options: ReturnType<typeof parseArgs>) {
  const experimentPath = resolve(options.target);
  const experiment = JSON.parse(readFileSync(experimentPath, "utf8")) as Experiment;
  if (!experiment.id || !/^[a-z0-9-]+$/.test(experiment.id)) throw new Error("experiment.id must be lower-case letters, digits and '-'");
  const sampleEvery = experiment.advance.sampleEvery ?? { months: 1 };
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const runId = `${experiment.id}-${stamp}`;
  const runDir = join(options.out, runId);
  for (const sub of ["samples", "static", "maps", "snapshots", "ce"]) mkdirSync(join(runDir, sub), { recursive: true });

  const own = options.server ? null : await startPrivateServer(join(runDir, "channels"));
  const server = options.server ?? own!.url;
  const api = client(server, options.token);
  const run = {
    v: 1,
    runId,
    experiment,
    experimentPath,
    server: own ? "private" : server,
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    // The sim:server advance runs the full economy; history / fast-forward modes are not used (§8).
    mockedPeriods: [] as unknown[],
    channels: [] as { label: string; channel: string; samples: number; probes: string[]; error?: string }[]
  };
  const save = () => writeFileSync(join(runDir, "run.json"), JSON.stringify(run, null, 2));
  save();

  const jobs = jobsOf(experiment, api, join(runDir, "maps"), Boolean(options.server));
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++;
      const job = jobs[index];
      const entry = { label: job.label, channel: job.channel ?? `obs-${stamp}-${index + 1}`, samples: 0, probes: [] } as (typeof run.channels)[number];
      run.channels.push(entry);
      try {
        if (!job.channel) {
          const archive = await job.source();
          await api.publish(archive, {
            id: entry.channel,
            name: `${experiment.id} ${job.label}`,
            ...(experiment.extensions ? { extensions: experiment.extensions.join(",") } : {}),
            ...(experiment.timeline === "new" ? { timeline: "new" } : {})
          });
        }
        const ops = `/channels/${entry.channel}/ops`;
        if (experiment.warmup && (experiment.warmup.years || experiment.warmup.months)) {
          log(`${entry.channel}: warmup ${JSON.stringify(experiment.warmup)}`);
          await api.json("POST", ops, { type: "advance", ...experiment.warmup });
        }
        log(`${entry.channel}: advance ${JSON.stringify(experiment.advance)}`);
        const totalMonths = (experiment.advance.years ?? 0) * 12 + (experiment.advance.months ?? 0);
        const probeAt = [...new Set((experiment.ceProbe?.at ?? []).map(offsetMonths))]
          .filter(m => m <= totalMonths)
          .sort((a, b) => a - b);
        const probe = async () => {
          const summary = (await api.json("GET", `/channels/${entry.channel}`)) as { summary: { date: { year: number; month: number; day: number } } };
          const { year, month, day } = summary.summary.date;
          const tag = `${entry.channel}@${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const snapshot = join(runDir, "snapshots", `${tag}.fmg`);
          writeFileSync(snapshot, await api.bytes(`/channels/${entry.channel}/archive`));
          const sample = (await api.json("GET", `/channels/${entry.channel}/observe/sample?detail=burgs`)) as { burgs: { id: number; pop: number }[] };
          const wanted = experiment.ceProbe?.burgs ?? { topByPopulation: 10 };
          const ids = [
            ...sample.burgs
              .slice()
              .sort((a, b) => b.pop - a.pop)
              .slice(0, wanted.topByPopulation ?? 0)
              .map(b => b.id),
            ...(wanted.ids ?? [])
          ];
          log(`${entry.channel}: CE probe ${tag} (${ids.length} burgs)`);
          await probeSnapshot(snapshot, [...new Set(ids)], join(runDir, "ce", `${tag}.json`));
          entry.probes.push(tag);
        };
        // Advance in segments that end at the probe points; sampling continues across them.
        let done = 0;
        for (const at of [...new Set([...probeAt, totalMonths])]) {
          if (at > done) {
            await api.json("POST", ops, { type: "advance", months: at - done, sampleEvery, sampleDetail: experiment.sampleDetail, runId });
            done = at;
          }
          if (probeAt.includes(at)) await probe();
        }
        if (experiment.advance.days)
          await api.json("POST", ops, { type: "advance", days: experiment.advance.days, sampleEvery, sampleDetail: experiment.sampleDetail, runId });
        const ofRun = (text: string) =>
          text
            .split("\n")
            .filter(Boolean)
            .filter(line => (JSON.parse(line) as { runId?: string }).runId === runId);
        const samples = ofRun(await api.text(`/channels/${entry.channel}/observe/samples`));
        writeFileSync(join(runDir, "samples", `${entry.channel}.ndjson`), samples.map(line => `${line}\n`).join(""));
        writeFileSync(
          join(runDir, "static", `${entry.channel}.ndjson`),
          ofRun(await api.text(`/channels/${entry.channel}/observe/static`))
            .map(line => `${line}\n`)
            .join("")
        );
        entry.samples = samples.length;
        log(`${entry.channel}: ${samples.length} samples`);
      } catch (error) {
        entry.error = (error as Error).message;
        log(`${entry.channel}: ${entry.error}`);
      }
      save();
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.max(1, experiment.workers ?? 1) }, worker));
  } finally {
    own?.child.kill();
  }
  run.finishedAt = new Date().toISOString();
  save();
  log(`run ${runId} written to ${runDir}`);
  writeReport(runDir);
}

function writeReport(runDir: string) {
  const files = buildReport(runDir);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(runDir, name), content);
  log(`report: ${Object.keys(files).join(", ")} in ${runDir}`);
}

const options = parseArgs(process.argv.slice(2));
if (options.command === "run") await runExperiment(options);
else {
  const dir = existsSync(options.target) ? resolve(options.target) : join(options.out, options.target);
  if (!existsSync(join(dir, "samples"))) {
    const known = existsSync(options.out) ? readdirSync(options.out).join(", ") : "none";
    throw new Error(`No run at ${dir} (runs: ${known})`);
  }
  writeReport(dir);
}
