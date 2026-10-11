#!/usr/bin/env node
// River-Port Lab L3 (docs/plan/river-port-lab.md §7): runs a batch job on `map:server --lab` and
// writes its NDJSON samples (one burg per line) as they arrive. Ctrl-C cancels the server job.
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Lab option sets (merged over DEFAULT_LAB_OPTIONS in the page). `control` = current algorithm. */
export const LAB_PRESETS = {
  balanced: { lab: {} },
  "port-heavy": {
    lab: { siteQuota: { estuary: 10, deltaBranch: 6, confluence: 2, meander: 2, riverBank: 2 } }
  },
  confluence: {
    lab: { siteQuota: { confluence: 10, confluenceBelow: 6, lakeOutlet: 3, estuary: 2, riverBank: 2 } }
  },
  control: { lab: { enabled: false }, filter: { all: true } }
};

const usage = `Usage: npm run lab:collect -- --out run.ndjson [--server http://127.0.0.1:8787] [--seeds 1..500 | --seeds 1,2,3]
         [--preset ${Object.keys(LAB_PRESETS).join("|")}] [--lab '{"riverDensity":5}'] [--cells 500]
         [--filter '{"all":true}'] [--include descriptor] [--no-cache] [--token T]`;
const args = process.argv.slice(2);
const log = message => console.error(`[lab:collect] ${message}`);

function parse() {
  const options = { server: "http://127.0.0.1:8787", seeds: "1..500", preset: "balanced", cache: true };
  const value = flag => {
    const val = args.shift();
    if (val === undefined || val.startsWith("--")) throw new Error(`Missing value for ${flag}\n${usage}`);
    return val;
  };
  while (args.length) {
    const flag = args.shift();
    if (flag === "--help") {
      console.log(usage);
      process.exit(0);
    } else if (flag === "--server") options.server = value(flag).replace(/\/+$/, "");
    else if (flag === "--seeds") options.seeds = value(flag);
    else if (flag === "--preset") options.preset = value(flag);
    else if (flag === "--lab") options.lab = JSON.parse(value(flag));
    else if (flag === "--cells") options.cells = Number(value(flag));
    else if (flag === "--filter") options.filter = JSON.parse(value(flag));
    else if (flag === "--include") options.include = value(flag).split(",");
    else if (flag === "--out") options.out = resolve(value(flag));
    else if (flag === "--token") options.token = value(flag);
    else if (flag === "--no-cache") options.cache = false;
    else throw new Error(`Unknown option: ${flag}\n${usage}`);
  }
  if (!options.out) throw new Error(usage);
  if (!LAB_PRESETS[options.preset]) throw new Error(`Unknown preset ${options.preset}\n${usage}`);
  return options;
}

async function main() {
  const options = parse();
  const preset = LAB_PRESETS[options.preset];
  const seeds = /^\d+\.\.\d+$/.test(options.seeds) ? options.seeds : options.seeds.split(",");
  const headers = { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) };
  const api = async (path, init = {}) => {
    const response = await fetch(`${options.server}${path}`, { headers, ...init });
    if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
    return response;
  };

  const job = await (
    await api("/api/lab/batch", {
      method: "POST",
      body: JSON.stringify({
        seeds,
        cells: options.cells,
        lab: { ...preset.lab, ...options.lab },
        filter: options.filter ?? preset.filter,
        include: options.include,
        cache: options.cache
      })
    })
  ).json();
  log(`job ${job.id}: ${job.total} seeds, preset ${options.preset} → ${options.out}`);

  let cancelled = false;
  process.once("SIGINT", () => {
    cancelled = true;
    log("cancelling…");
    api(`/api/lab/jobs/${job.id}`, { method: "DELETE" }).catch(() => {});
  });

  const progress = setInterval(async () => {
    try {
      const s = await (await api(`/api/lab/jobs/${job.id}`)).json();
      log(`${s.done}/${s.total} seeds (${s.cached} cached, ${s.failed} failed), ${s.samples} samples`);
    } catch {
      /* the final status is printed below */
    }
  }, 15000);

  mkdirSync(dirname(options.out), { recursive: true });
  const out = createWriteStream(options.out);
  const samples = await api(`/api/lab/jobs/${job.id}/samples`);
  let lines = 0;
  for await (const chunk of samples.body) {
    out.write(chunk);
    lines += Buffer.from(chunk).toString("utf8").split("\n").length - 1;
  }
  await new Promise(resolveEnd => out.end(resolveEnd));
  clearInterval(progress);

  const status = await (await api(`/api/lab/jobs/${job.id}`)).json();
  log(`${status.status}: ${status.done}/${status.total} seeds, ${lines} samples, ${status.cached} cached, ${status.failed} failed`);
  for (const failure of status.failures) log(`  seed ${failure.seed}: ${failure.error}`);
  if (cancelled || status.status !== "done") process.exitCode = 130;
  else if (status.failed) process.exitCode = 2;
}

try {
  await main();
} catch (error) {
  log(error?.message ?? String(error));
  process.exitCode = 1;
}
