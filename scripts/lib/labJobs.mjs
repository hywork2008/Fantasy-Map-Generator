// River-Port Lab L3 (docs/plan/river-port-lab.md §6): batch jobs over the lab page pool, NDJSON
// samples (one burg per line, §5) and a per-seed cache keyed by (seed, request, code version).
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const MAX_SEEDS = 100000;
const FINISHED_JOBS_KEPT = 20;

/**
 * Code version for cache keys: HEAD plus a hash of uncommitted changes, so editing the generator
 * without committing never serves stale samples. Taken once at server start; restart after edits.
 */
export function codeVersion() {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  try {
    const head = git("rev-parse", "HEAD").trim();
    const dirty = git("diff", "HEAD", "--", "src", "public", "index.html") + git("ls-files", "--others", "--exclude-standard", "src");
    return dirty ? `${head}+${createHash("sha256").update(dirty).digest("hex").slice(0, 12)}` : head;
  } catch {
    return `nogit-${Date.now()}`;
  }
}

/** `{start, count}`, `"1..500"`, or an array of seeds → numeric seed strings. */
export function expandSeeds(seeds) {
  let list;
  if (Array.isArray(seeds)) list = seeds.map(String);
  else if (typeof seeds === "string" && /^\d+\.\.\d+$/.test(seeds)) {
    const [from, to] = seeds.split("..").map(Number);
    list = to >= from && to - from < MAX_SEEDS ? Array.from({ length: to - from + 1 }, (_, i) => String(from + i)) : [];
  } else if (seeds && Number.isSafeInteger(seeds.start) && Number.isSafeInteger(seeds.count) && seeds.count > 0)
    list = Array.from({ length: Math.min(seeds.count, MAX_SEEDS) }, (_, i) => String(seeds.start + i));
  else list = [];
  if (!list.length || list.length > MAX_SEEDS || list.some(seed => !/^\d+$/.test(seed)))
    throw Object.assign(new Error('seeds must be [..], "from..to" or {start, count} of numeric seeds'), { status: 400 });
  return list;
}

/** The request without its seed; part of the cache key. */
const requestKey = ({ cells, lab, filter, include }) => JSON.stringify({ cells, lab, filter, include });

export function createLabJobs({ pool, log = () => {}, cacheDir = join(root, ".cache/lab"), version = codeVersion() }) {
  mkdirSync(cacheDir, { recursive: true });
  const jobs = new Map();
  log(`lab cache ${cacheDir} (code ${version})`);

  const cacheFile = (seed, request) =>
    join(cacheDir, `${createHash("sha256").update(`${version}\n${seed}\n${requestKey(request)}`).digest("hex").slice(0, 32)}.ndjson`);

  /** One seed → NDJSON lines (`{map, burg}` per burg), from the cache or a fresh generation. */
  async function sampleSeed(seed, request, useCache) {
    const file = cacheFile(seed, request);
    if (useCache && existsSync(file)) return { lines: readFileSync(file, "utf8").split("\n").filter(Boolean), cached: true };
    const { burgs, map, pageErrors } = await pool.generate({ ...request, seed });
    const mapRecord = { ...map, gitHead: version, pageErrors };
    const lines = burgs.map(burg => JSON.stringify({ map: mapRecord, burg }));
    // A map with no matching burg still caches (an empty file), so reruns skip it too.
    writeFileSync(`${file}.tmp`, lines.length ? `${lines.join("\n")}\n` : "");
    renameSync(`${file}.tmp`, file);
    return { lines, cached: false };
  }

  function publicJob(job) {
    return {
      id: job.id,
      status: job.status,
      total: job.seeds.length,
      done: job.done,
      failed: job.failures.length,
      cached: job.cached,
      samples: job.lines.length,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt ?? null,
      failures: job.failures.slice(0, 50)
    };
  }

  function notify(job) {
    for (const listener of job.listeners) listener();
  }

  async function run(job) {
    let next = 0;
    const worker = async () => {
      while (job.status === "running" && next < job.seeds.length) {
        const seed = job.seeds[next++];
        try {
          const { lines, cached } = await sampleSeed(seed, job.request, job.useCache);
          job.lines.push(...lines);
          if (cached) job.cached++;
        } catch (error) {
          job.failures.push({ seed, error: String(error?.message ?? error).split("\n")[0] });
        }
        job.done++;
        notify(job);
      }
    };
    await Promise.all(Array.from({ length: pool.workers }, worker));
    if (job.status === "running") job.status = "done";
    job.finishedAt = new Date().toISOString();
    log(`lab job ${job.id} ${job.status}: ${job.done}/${job.seeds.length} seeds, ${job.lines.length} samples, ${job.failures.length} failed, ${job.cached} cached`);
    notify(job);
    // Forget old finished jobs; their samples remain in the cache.
    const finished = [...jobs.values()].filter(j => j.status !== "running");
    for (const old of finished.slice(0, Math.max(0, finished.length - FINISHED_JOBS_KEPT))) jobs.delete(old.id);
  }

  function create(body) {
    const { seeds, cells, lab, filter, include, timeoutMs, cache = true } = body ?? {};
    if (include?.includes("fmg")) throw Object.assign(new Error('batch jobs do not return "fmg"; use /api/lab/generate'), { status: 400 });
    const job = {
      id: randomUUID().slice(0, 8),
      status: "running",
      seeds: expandSeeds(seeds),
      request: { cells, lab, filter, include, timeoutMs },
      useCache: cache !== false,
      done: 0,
      cached: 0,
      failures: [],
      lines: [],
      listeners: new Set(),
      startedAt: new Date().toISOString()
    };
    jobs.set(job.id, job);
    log(`lab job ${job.id}: ${job.seeds.length} seeds`);
    void run(job);
    return publicJob(job);
  }

  const get = id => {
    const job = jobs.get(id);
    if (!job) throw Object.assign(new Error(`no lab job ${id}`), { status: 404 });
    return job;
  };

  /** Streams every sample so far, then follows the job until it ends (or the client leaves). */
  function streamSamples(id, response, request) {
    const job = get(id);
    response.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" });
    let sent = 0;
    const flush = () => {
      if (sent < job.lines.length) {
        response.write(`${job.lines.slice(sent).join("\n")}\n`);
        sent = job.lines.length;
      }
      if (job.status !== "running") {
        job.listeners.delete(flush);
        response.end();
      }
    };
    job.listeners.add(flush);
    request.on("close", () => job.listeners.delete(flush));
    flush();
  }

  function cancel(id) {
    const job = get(id);
    if (job.status === "running") job.status = "cancelled"; // in-flight seeds finish, no new ones start
    return publicJob(job);
  }

  return { create, status: id => publicJob(get(id)), streamSamples, cancel, sampleSeed };
}
