// Headless CE giant-city benchmark: replays a Worker request captured with
// CE_CAPTURE_REQUEST (scripts/profileCePopulation.mjs) over populations and seeds.
//   node scripts/benchmarkCeGiant.mjs --request temp/giant/request-ppi409.json \
//     --populations 15000,50000,100000,215000 --seeds ppi409 --out temp/giant/sweep.jsonl [--probe] [--warmup 1]
// One fresh process per run, so JIT/GC state of a previous city does not leak in.
import { execFileSync, fork } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { cpus, platform } from "node:os";
import { dirname, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "1" : all[i + 1]]);
  return pairs;
}, []));
const root = resolve(import.meta.dirname, "..");
const request = args.request ?? "temp/giant/request-ppi409.json";
const populations = (args.populations ?? "215000").split(",").map(Number);
const seeds = (args.seeds ?? "").split(",").filter(Boolean);
const out = args.out ?? "temp/giant/sweep.jsonl";
const warmup = Number(args.warmup ?? 0);
const probe = !!args.probe;
const source = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  dirty: !!execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
};
mkdirSync(dirname(out), { recursive: true });

function child(runs) {
  return new Promise((resolveRun, reject) => {
    const proc = fork(resolve(root, "scripts/ceGiantWorker.mjs"), [], {
      cwd: root, execArgv: ["--max-old-space-size=8192", ...(args["cpu-prof"] ? ["--cpu-prof", `--cpu-prof-dir=${args["cpu-prof"]}`] : [])],
      stdio: ["ignore", "inherit", "inherit", "ipc"]
    });
    const results = [];
    proc.on("message", message => {
      if (message.type === "ready") proc.send({ runs });
      else if (message.type === "result") results.push(message.result);
      else if (message.type === "done") { proc.disconnect(); resolveRun(results); }
      else if (message.type === "fatal") reject(new Error(message.error));
    });
    proc.on("exit", code => code && reject(new Error(`worker exited ${code}`)));
  });
}

for (const seed of seeds.length ? seeds : [undefined]) {
  for (const population of populations) {
    const runs = [...Array(warmup).fill({ request, population, seed, probe: false, warmup: true }),
      { request, population, seed, probe }];
    const results = await child(runs);
    for (const result of results.filter(r => !r.warmup)) {
      appendFileSync(out, `${JSON.stringify({ ...result, source, environment: { platform: platform(), cpu: cpus()[0]?.model, node: process.version }, at: new Date().toISOString() })}\n`);
      console.log(`${seed ?? "(request)"} ${population}: ${result.success ? "ok" : "FAILED"} ${(result.totalMs / 1000).toFixed(2)} s, ${result.faces} faces, attempts ${result.attempts}`);
    }
  }
}
