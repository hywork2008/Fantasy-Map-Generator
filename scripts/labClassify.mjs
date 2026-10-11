#!/usr/bin/env node
// River-Port Lab L0 (docs/plan/river-port-lab.md): classifies every burg of saved .fmg files by its
// river/sea relation and prints one NDJSON row per burg plus a per-kind summary on stderr.
import { fork } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const portsOnly = args.includes("--ports-only");
const maps = args.filter(arg => !arg.startsWith("--"));
if (!maps.length) {
  console.error("Usage: npm run lab:classify -- <map.fmg>... [--ports-only] > sites.ndjson");
  process.exit(1);
}

function classify(mapPath) {
  return new Promise((resolveRows, reject) => {
    const worker = fork(resolve(import.meta.dirname, "mapServerWorker.mjs"), [resolve(mapPath)], {
      stdio: ["ignore", "ignore", "inherit", "ipc"]
    });
    worker.on("message", message => {
      if (message.type === "fatal") reject(new Error(message.error));
      else if (message.type === "ready") worker.send({ id: 1, method: "classifyBurgSites", args: [] });
      else if (message.id === 1) {
        worker.kill();
        message.error ? reject(new Error(message.error)) : resolveRows(message.result);
      }
    });
    worker.on("exit", code => code && reject(new Error(`worker exited with ${code}`)));
  });
}

const summary = {};
for (const mapPath of maps) {
  try {
    for (const row of await classify(mapPath)) {
      if (portsOnly && !(row.seaPort || row.riverPort || row.lakePort)) continue;
      process.stdout.write(`${JSON.stringify({ map: mapPath, ...row })}\n`);
      const kind = row.site?.kind ?? "water";
      const s = (summary[kind] ??= { burgs: 0, seaPort: 0, riverPort: 0, both: 0 });
      s.burgs++;
      if (row.seaPort) s.seaPort++;
      if (row.riverPort) s.riverPort++;
      if (row.seaPort && row.riverPort) s.both++;
    }
  } catch (error) {
    console.error(`[lab:classify] ${mapPath}: ${error.message}`);
  }
}
console.error(`[lab:classify] ${maps.length} map(s)`);
new console.Console(process.stderr).table(summary);
