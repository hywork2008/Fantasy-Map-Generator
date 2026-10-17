#!/usr/bin/env tsx
/**
 * Simulation channel server (docs/plan/simulation-channel-server.md §13): holds any number of
 * worlds ("channels"), each in its own process, and lets browsers and AI agents read and advance
 * them over plain REST.
 *
 *   npm run sim:server -- [--port 8788] [--host 127.0.0.1] [--data data/channels] [--token T]
 *
 * --token  required as `Authorization: Bearer T` for every write (publish, ops, delete). Reads stay open.
 */
import { type ChildProcess, fork } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? undefined : args[at + 1];
};
if (args.includes("--help")) {
  console.log("Usage: npm run sim:server -- [--port 8788] [--host 127.0.0.1] [--data data/channels] [--token T]");
  process.exit(0);
}
const port = Number(flag("port") ?? process.env.FMG_SIM_PORT ?? 8788);
const host = flag("host") ?? "127.0.0.1";
const dataDir = resolve(flag("data") ?? process.env.FMG_SIM_DATA ?? join(root, "data/channels"));
const token = flag("token") ?? process.env.FMG_SIM_TOKEN ?? "";
const MAX_UPLOAD = 512 * 1024 * 1024;
const IDLE_MS = 10 * 60 * 1000;
const workerPath = join(root, "scripts/lib/simChannelWorker.mts");
const log = (message: string) => console.error(`[sim:server] ${message}`);
mkdirSync(dataDir, { recursive: true });

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error & { status?: number }) => void;
}
interface Channel {
  child: ChildProcess;
  ready: Promise<void>;
  pending: Map<number, Pending>;
  idle?: NodeJS.Timeout;
}

const channels = new Map<string, Channel>();
const subscribers = new Map<string, Set<ServerResponse>>();
let nextRequestId = 1;

const channelDir = (id: string) => join(dataDir, id);
const isChannelId = (id: string) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) && existsSync(join(channelDir(id), "channel.json"));
const readMeta = (id: string) => JSON.parse(readFileSync(join(channelDir(id), "channel.json"), "utf8"));

function startChannel(id: string): Channel {
  const child = fork(workerPath, [channelDir(id)], { execArgv: ["--import", "tsx"], stdio: ["ignore", "inherit", "inherit", "ipc"] });
  const pending = new Map<number, Pending>();
  let markReady: () => void;
  let failReady: (error: Error) => void;
  const ready = new Promise<void>((done, fail) => {
    markReady = done;
    failReady = fail;
  });
  child.on("message", (message: { ready?: boolean; id?: number; ok?: boolean; result?: unknown; error?: string; status?: number }) => {
    if (message.ready) return markReady();
    const request = pending.get(message.id ?? -1);
    if (!request) return;
    pending.delete(message.id!);
    if (message.ok) request.resolve(message.result);
    else request.reject(Object.assign(new Error(message.error ?? "Channel error"), { status: message.status }));
  });
  child.on("exit", code => {
    channels.delete(id);
    failReady(new Error(`Channel '${id}' failed to load (exit ${code})`));
    for (const request of pending.values()) request.reject(new Error(`Channel '${id}' stopped (exit ${code})`));
    log(`channel ${id} stopped (exit ${code})`);
  });
  const channel: Channel = { child, ready, pending };
  channels.set(id, channel);
  log(`channel ${id} starting`);
  return channel;
}

async function call(id: string, request: Record<string, unknown>): Promise<unknown> {
  const channel = channels.get(id) ?? startChannel(id);
  await channel.ready;
  clearTimeout(channel.idle);
  const requestId = nextRequestId++;
  try {
    return await new Promise((resolve, reject) => {
      channel.pending.set(requestId, { resolve, reject });
      channel.child.send({ ...request, id: requestId });
    });
  } finally {
    // Unused channels give their memory back; the next request reloads current.fmg.
    if (channel.pending.size === 0) channel.idle = setTimeout(() => channel.child.kill(), IDLE_MS);
  }
}

function notify(id: string, event: string, data: unknown) {
  for (const response of subscribers.get(id) ?? []) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const isBytes = body instanceof Uint8Array;
  response.writeHead(status, {
    "Content-Type": isBytes ? "application/octet-stream" : "application/json; charset=utf-8",
    ...headers
  });
  response.end(isBytes ? body : JSON.stringify(body, null, 2));
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_UPLOAD) throw Object.assign(new Error("Upload too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const readJson = async (request: IncomingMessage) => {
  const text = (await readBody(request)).toString("utf8");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw Object.assign(new Error("Body must be JSON"), { status: 400 });
  }
};

function authorized(request: IncomingMessage): boolean {
  return !token || request.headers.authorization === `Bearer ${token}`;
}

function newChannelId(): string {
  let n = 1;
  while (existsSync(channelDir(`world-${n}`))) n++;
  return `world-${n}`;
}

function listChannels() {
  return readdirSync(dataDir)
    .filter(isChannelId)
    .map(id => ({ ...readMeta(id), running: channels.has(id) }));
}

/** Self-description for an AI given only a channel URL. */
function debugIndex(api: string) {
  return {
    hint: "Share a channel URL plus entity ids; these read-only views reproduce FMG/City Editor inputs without a browser.",
    endpoints: {
      summary: `${api}`,
      burg: `${api}/burgs/{id}`,
      burgContext: `${api}/burgs/{id}/context  (home cell, cell under the town, displacement, nearby burgs, routes + bridge checks, waterfront issues)`,
      burgSite: `${api}/burgs/{id}/site  (the exact City Editor site descriptor; runs CE's road convergence first, ~3 s)`,
      cell: `${api}/cells/{id}`,
      route: `${api}/routes/{id}`,
      settlementDiagnostics: `${api}/diagnostics/settlement?minSeparationRadii=2  (towns outside their cell, crowded pairs, bridges in the sea or over the skew limit)`,
      archive: `${api}/archive  (the .fmg; open it in FMG to look at the same world)`,
      observe: `${api}/observe/{sample|routes|approaches|corridors|markets|staticInfo|samples}  (traffic observatory; docs/plan/approach-traffic-observatory.md §5)`
    }
  };
}

const base = (request: IncomingMessage) => `http://${request.headers.host ?? `${host}:${port}`}`;

async function route(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://local");
  const parts = url.pathname.split("/").filter(Boolean);
  const method = request.method ?? "GET";
  if (parts[0] !== "api" || parts[1] !== "sim") return send(response, 404, { error: "Not found" });
  const [, , resource, id, sub, entityId, view] = parts;
  const write = method !== "GET";
  // Anyone may delete a channel (deliberate: shared scratch worlds); other writes need the token.
  const isDelete = method === "DELETE" && resource === "channels" && id !== undefined && sub === undefined;
  if (write && !isDelete && !authorized(request)) return send(response, 401, { error: "Bearer token required" });

  if (resource === "health") return send(response, 200, { ok: true, channels: listChannels().length, writable: true, auth: Boolean(token) });

  if (resource !== "channels") return send(response, 404, { error: "Not found" });

  if (!id) {
    if (method === "GET") return send(response, 200, listChannels());
    if (method === "POST") {
      // Body: a .fmg. ?id= picks the channel id, ?name= the display name.
      const archive = await readBody(request);
      if (archive.length < 4) return send(response, 400, { error: "Body must be a .fmg archive" });
      const wanted = url.searchParams.get("id");
      if (wanted && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(wanted)) return send(response, 400, { error: "Invalid channel id" });
      if (wanted && existsSync(channelDir(wanted))) return send(response, 409, { error: `Channel '${wanted}' exists` });
      const channelId = wanted ?? newChannelId();
      const dir = channelDir(channelId);
      mkdirSync(join(dir, "snapshots"), { recursive: true });
      writeFileSync(join(dir, "current.fmg"), archive);
      writeFileSync(join(dir, "snapshots/r000000.fmg"), archive);
      const now = new Date().toISOString();
      // The simulation extensions the publisher had enabled (enablement is not in the .fmg); omitted = all.
      const extensions = url.searchParams.get("extensions")?.split(",").filter(Boolean);
      // ?timeline=new starts a fresh RNG timeline from the seed (as `npm run sim -- --timeline new`).
      const timeline = url.searchParams.get("timeline") === "new" ? "new" : undefined;
      const meta = { id: channelId, name: url.searchParams.get("name") ?? channelId, createdAt: now, updatedAt: now, revision: 0, extensions, timeline };
      writeFileSync(join(dir, "channel.json"), JSON.stringify(meta, null, 2));
      writeFileSync(join(dir, "journal.ndjson"), "");
      try {
        const summary = (await call(channelId, { type: "summary" })) as { date: unknown; counts: unknown };
        Object.assign(meta, { date: summary.date, counts: summary.counts });
        writeFileSync(join(dir, "channel.json"), JSON.stringify(meta, null, 2));
        log(`channel ${channelId} published (${archive.length} bytes)`);
        return send(response, 201, { ...meta, summary, api: `${base(request)}/api/sim/channels/${channelId}` });
      } catch (error) {
        channels.get(channelId)?.child.kill();
        rmSync(dir, { recursive: true, force: true });
        return send(response, 422, { error: `The archive could not be loaded: ${(error as Error).message}` });
      }
    }
    return send(response, 405, { error: "Method not allowed" });
  }

  if (!isChannelId(id)) return send(response, 404, { error: `No channel '${id}'` });

  if (!sub) {
    if (method === "GET") return send(response, 200, { ...readMeta(id), summary: await call(id, { type: "summary" }) });
    if (method === "DELETE") {
      channels.get(id)?.child.kill();
      rmSync(channelDir(id), { recursive: true, force: true });
      notify(id, "deleted", { id });
      log(`channel ${id} deleted`);
      return send(response, 200, { deleted: id });
    }
    return send(response, 405, { error: "Method not allowed" });
  }

  if (sub === "archive" && method === "GET") {
    const meta = readMeta(id);
    return send(response, 200, readFileSync(join(channelDir(id), "current.fmg")), {
      ETag: `"r${meta.revision}"`,
      "Content-Disposition": `attachment; filename="${id}.fmg"`
    });
  }
  if (sub === "journal" && method === "GET") {
    const since = Number(url.searchParams.get("since") ?? 0);
    const lines = readFileSync(join(channelDir(id), "journal.ndjson"), "utf8").split("\n").filter(Boolean);
    return send(response, 200, lines.map(line => JSON.parse(line)).filter(entry => entry.revision > since));
  }
  if (sub === "events" && method === "GET") {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    response.write(`event: hello\ndata: ${JSON.stringify({ revision: readMeta(id).revision })}\n\n`);
    const set = subscribers.get(id) ?? new Set();
    subscribers.set(id, set);
    set.add(response);
    request.on("close", () => set.delete(response));
    return;
  }
  if (sub === "ops" && method === "POST") {
    const body = await readJson(request);
    const user = typeof request.headers["x-fmg-user"] === "string" ? request.headers["x-fmg-user"] : undefined;
    if (body.type !== "advance" && body.type !== "command")
      return send(response, 400, { error: "type must be 'advance' or 'command'" });
    if (body.type === "command" && (typeof body.extensionId !== "string" || typeof body.name !== "string"))
      return send(response, 400, { error: "command needs extensionId and name" });
    const result = (await call(id, { ...body, user })) as { revision?: number };
    notify(id, "revision", { revision: result.revision, op: body.type });
    return send(response, 200, result);
  }
  // Observatory (docs/plan/approach-traffic-observatory.md §5). Read-only.
  if (sub === "observe" && method === "GET") {
    if (entityId === "samples" || entityId === "static") {
      // What `advance` + `sampleEvery` appended in the worker, as NDJSON.
      const file = join(channelDir(id), entityId === "samples" ? "observe.ndjson" : "observe.static.ndjson");
      return send(response, 200, existsSync(file) ? readFileSync(file) : Buffer.alloc(0), { "Content-Type": "application/x-ndjson" });
    }
    const views = ["sample", "routes", "approaches", "corridors", "markets", "staticInfo"];
    if (!entityId || !views.includes(entityId)) return send(response, 404, { error: `observe/{${views.join("|")}|samples|static}` });
    const viewName = entityId === "staticInfo" ? "static" : entityId;
    return send(response, 200, await call(id, { type: "observe", view: viewName, params: Object.fromEntries(url.searchParams) }));
  }
  // Debug views for AI-assisted defect reports (docs/plan/simulation-channel-server.md §16).
  if (method === "GET") {
    const n = Number(entityId);
    if (sub === "debug" && !entityId) return send(response, 200, debugIndex(`${base(request)}/api/sim/channels/${id}`));
    if (sub === "diagnostics" && entityId === "settlement")
      return send(response, 200, await call(id, { type: "debug", view: "settlement", params: Object.fromEntries(url.searchParams) }));
    if (sub === "cells" && entityId !== undefined && !view) {
      if (!Number.isSafeInteger(n)) return send(response, 400, { error: "Cell id must be an integer" });
      return send(response, 200, await call(id, { type: "debug", view: "cell", entityId: n }));
    }
    if (sub === "burgs" && entityId !== undefined && (view === "context" || view === "site")) {
      if (!Number.isSafeInteger(n)) return send(response, 400, { error: "Entity id must be an integer" });
      return send(response, 200, await call(id, { type: "debug", view: view === "site" ? "burgSite" : "burgContext", entityId: n }));
    }
    if (view !== undefined) return send(response, 404, { error: "Not found" });
  }
  // Read-only views of pack collections: /burgs, /burgs/12, /states?q=…
  if (method === "GET") {
    if (entityId !== undefined) {
      const n = Number(entityId);
      if (!Number.isSafeInteger(n)) return send(response, 400, { error: "Entity id must be an integer" });
      return send(response, 200, await call(id, { type: "get", collection: sub, entityId: n }));
    }
    return send(response, 200, await call(id, { type: "list", collection: sub, q: url.searchParams.get("q") ?? undefined }));
  }
  return send(response, 404, { error: "Not found" });
}

const server = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-FMG-User");
  if (request.method === "OPTIONS") return void response.writeHead(204).end();
  route(request, response).catch(error => {
    const status = (error as { status?: number }).status ?? 500;
    if (!response.headersSent) send(response, status, { error: (error as Error).message });
  });
});

server.listen(port, host, () => {
  log(`listening on http://${host}:${port}/api/sim (data: ${dataDir}${token ? ", writes need the token" : ""})`);
});

const shutdown = () => {
  for (const channel of channels.values()) channel.child.kill();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
