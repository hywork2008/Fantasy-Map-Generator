/**
 * One simulation channel in its own process (docs/plan/simulation-channel-server.md §3): the core
 * keeps module-level state, so one process holds exactly one world. Driven by scripts/simServer.mts
 * over IPC; every request is answered with `{ id, ok, result | error }`.
 */
import { appendFileSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createNodeSimulationHost, loadWorld } from "../../src/simulation/adapters/node";

type Request =
  | { id: number; type: "summary" }
  | { id: number; type: "list"; collection: string; q?: string }
  | { id: number; type: "get"; collection: string; entityId: number }
  | { id: number; type: "advance"; years?: number; months?: number; days?: number; user?: string }
  | { id: number; type: "command"; extensionId: string; name: string; payload: unknown; user?: string };

const dir = process.argv[2];
if (!dir || !process.send) throw new Error("simChannelWorker must be forked with a channel directory");
const send = process.send.bind(process);

/** pack collections the API may read; values are projected to their primitive fields. */
const COLLECTIONS = new Set(["burgs", "states", "provinces", "cultures", "religions", "markers", "rivers", "routes"]);

const meta = JSON.parse(readFileSync(join(dir, "channel.json"), "utf8")) as { revision: number; extensions?: string[] };
const host = createNodeSimulationHost({ extensions: meta.extensions });
const bytes = readFileSync(join(dir, "current.fmg"));
await loadWorld(host, new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));

const date = () => ({
  year: host.simulation.currentYear,
  month: host.simulation.currentMonth,
  day: host.simulation.currentDay
});

function primitives(entity: unknown): Record<string, unknown> | null {
  if (!entity || typeof entity !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) out[key] = value;
  }
  return out;
}

function collection(name: string): unknown[] {
  if (!COLLECTIONS.has(name)) throw new Error(`Unknown collection '${name}' (${[...COLLECTIONS].join(", ")})`);
  const value = (host.world.pack as unknown as Record<string, unknown>)[name];
  return Array.isArray(value) ? value : [];
}

/** Writes the world and appends the op; the snapshot is replaced atomically. */
async function commit(op: Record<string, unknown>, user: string | undefined, started: number) {
  const archive = await host.saveArchive();
  const tmp = join(dir, "current.fmg.tmp");
  writeFileSync(tmp, archive);
  renameSync(tmp, join(dir, "current.fmg"));
  meta.revision += 1;
  const entry = { revision: meta.revision, op, user: user ?? null, at: new Date().toISOString(), date: date(), ms: Math.round(performance.now() - started) };
  appendFileSync(join(dir, "journal.ndjson"), `${JSON.stringify(entry)}\n`);
  const channelPath = join(dir, "channel.json");
  const stored = JSON.parse(readFileSync(channelPath, "utf8"));
  writeFileSync(channelPath, JSON.stringify({ ...stored, revision: meta.revision, date: date(), updatedAt: entry.at }, null, 2));
  return entry;
}

async function handle(request: Request): Promise<unknown> {
  switch (request.type) {
    case "summary": {
      const pack = host.world.pack;
      const live = (items: unknown[]) => items.filter(item => item && !(item as { removed?: boolean }).removed).length;
      return {
        revision: meta.revision,
        mapName: host.world.options.mapName ?? null,
        seed: host.world.seed,
        date: date(),
        tickCount: host.simulation.tickCount,
        extensions: meta.extensions ?? null,
        counts: Object.fromEntries([...COLLECTIONS].map(name => [name, live(collection(name))])),
        cells: pack.cells.i.length
      };
    }
    case "list": {
      const q = request.q?.toLowerCase();
      return collection(request.collection)
        .map(primitives)
        .filter((item): item is Record<string, unknown> => item !== null && !item.removed)
        .filter(item => !q || String(item.name ?? "").toLowerCase().includes(q));
    }
    case "get": {
      const entity = collection(request.collection).find(item => (item as { i?: number })?.i === request.entityId);
      if (!entity) throw Object.assign(new Error("Not found"), { status: 404 });
      return entity;
    }
    case "advance": {
      const duration = { years: request.years ?? 0, months: request.months ?? 0, days: request.days ?? 0 };
      for (const n of Object.values(duration)) {
        if (!Number.isSafeInteger(n) || n < 0) throw Object.assign(new Error("years/months/days must be non-negative integers"), { status: 400 });
      }
      if (!duration.years && !duration.months && !duration.days) throw Object.assign(new Error("Empty duration"), { status: 400 });
      const started = performance.now();
      const from = date();
      host.advance(duration);
      // Economy's monthly settlement runs right after the advance returns (adapters/node.ts).
      await new Promise(done => setImmediate(done));
      return { from, ...(await commit({ type: "advance", ...duration }, request.user, started)) };
    }
    case "command": {
      const started = performance.now();
      const result = host.dispatch({ extensionId: request.extensionId, name: request.name, payload: request.payload });
      if (!result) return { changed: false, revision: meta.revision };
      const entry = await commit({ type: "command", extensionId: request.extensionId, name: request.name, payload: request.payload }, request.user, started);
      return { changed: true, result: result.result ?? null, ...entry };
    }
  }
}

// Ops run one at a time, in arrival order.
let queue = Promise.resolve();
process.on("message", (request: Request) => {
  queue = queue.then(async () => {
    try {
      send({ id: request.id, ok: true, result: await handle(request) });
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500;
      send({ id: request.id, ok: false, status, error: error instanceof Error ? error.message : String(error) });
    }
  });
});
send({ ready: true });
