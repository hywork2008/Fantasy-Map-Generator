#!/usr/bin/env node
// Serves one .fmg to many viewers: GET is open to everyone, writing needs the editor token.
// docs/plan/map-server.md
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, readFileSync, renameSync, rmSync, watch, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const usage = "Usage: npm run map:server -- <map.fmg> [--port 8787] [--host 127.0.0.1] [--editor-token T] [--read-token T]";
const args = process.argv.slice(2);
const flag = name => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? undefined : args[at + 1];
};
const mapPath = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : null;
if (!mapPath || args.includes("--help")) {
  console.log(usage);
  process.exit(mapPath ? 0 : 1);
}
const port = Number(flag("port") ?? process.env.FMG_MAP_PORT ?? 8787);
const host = flag("host") ?? "127.0.0.1";
const editorToken = flag("editor-token") ?? process.env.FMG_EDITOR_TOKEN ?? "";
const readToken = flag("read-token") ?? process.env.FMG_READ_TOKEN ?? "";
const MAX_UPLOAD = 512 * 1024 * 1024;
const log = message => console.error(`[map:server] ${message}`);

let version = "";
let current = null;
const subscribers = new Set();

const hashFile = path => `"${createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 32)}"`;

/** One private process per loaded map, so FMG's module-level caches can never go stale. */
function startWorker(path) {
  const child = fork(join(root, "scripts/mapServerWorker.mjs"), [path], {
    cwd: root, execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "inherit", "ipc"]
  });
  const worker = { child, pending: new Map(), nextId: 1 };
  worker.ready = new Promise((resolveReady, rejectReady) => {
    child.on("message", message => {
      if (message.type === "ready") return resolveReady(message.info);
      if (message.type === "fatal") return rejectReady(new Error(message.error));
      const call = worker.pending.get(message.id);
      if (!call) return;
      worker.pending.delete(message.id);
      message.error ? call.reject(new Error(message.error)) : call.resolve(message.result);
    });
    child.on("exit", code => {
      rejectReady(new Error(`worker exited (${code})`));
      for (const { reject } of worker.pending.values()) reject(new Error("map reloaded"));
    });
  });
  worker.ready.catch(() => {});
  return worker;
}

async function call(method, ...callArgs) {
  const worker = current;
  if (!worker) throw Object.assign(new Error("map is still loading"), { status: 503 });
  return new Promise((resolveCall, reject) => {
    const id = worker.nextId++;
    worker.pending.set(id, { resolve: resolveCall, reject });
    worker.child.send({ id, method, args: callArgs });
  });
}

function adopt(worker, reason) {
  const previous = current;
  current = worker;
  previous?.child.kill("SIGKILL");
  log(`${reason}: version ${version}`);
  for (const response of subscribers) response.write(`event: map\ndata: ${JSON.stringify({ version })}\n\n`);
}

/** Loads `path` in a fresh worker; the served map is replaced only if that succeeds. */
async function tryReload(path, reason) {
  const candidate = startWorker(path);
  try {
    await candidate.ready;
  } catch (error) {
    candidate.child.kill("SIGKILL");
    throw error;
  }
  return candidate;
}

let debounce;
watch(dirname(mapPath), (_event, name) => {
  if (name !== mapPath.split("/").pop()) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (!existsSync(mapPath) || hashFile(mapPath) === version) return;
    const fileVersion = hashFile(mapPath);
    tryReload(mapPath).then(
      worker => {
        version = fileVersion;
        adopt(worker, "file changed");
      },
      error => log(`ignored changed file, keeping previous map: ${error.message.split("\n")[0]}`)
    );
  }, 300);
});

const bearer = request => (request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
const json = (response, status, body, headers = {}) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
};

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_UPLOAD) throw Object.assign(new Error("too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function handle(request, response) {
  const url = new URL(request.url, "http://x");
  const path = url.pathname.replace(/\/+$/, "");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match");
  response.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  response.setHeader("Access-Control-Expose-Headers", "ETag");
  if (request.method === "OPTIONS") return response.writeHead(204).end();
  if (path === "/api/health") return json(response, 200, { ok: true, version, writable: Boolean(editorToken) });
  const token = bearer(request);
  const isEditor = Boolean(editorToken) && token === editorToken;
  if (readToken && token !== readToken && !isEditor) return json(response, 401, { error: "unauthorized" });

  if (path === "/api/map" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/octet-stream", ETag: version });
    return response.end(readFileSync(mapPath));
  }
  if (path === "/api/map" && request.method === "PUT") {
    if (!isEditor) return json(response, 403, { error: "editor token required" });
    if (request.headers["if-match"] !== version)
      return json(response, 409, { error: "map changed on the server; reload before saving", version }, { ETag: version });
    const body = await readBody(request);
    if (body.length < 4) return json(response, 400, { error: "empty body" });
    const tmp = `${mapPath}.upload`;
    writeFileSync(tmp, body);
    let worker;
    try {
      worker = await tryReload(tmp);
    } catch (error) {
      rmSync(tmp, { force: true });
      return json(response, 422, { error: `not a loadable map: ${error.message.split("\n")[0]}`, version });
    }
    version = hashFile(tmp);
    renameSync(tmp, mapPath);
    adopt(worker, "uploaded");
    return json(response, 200, { version }, { ETag: version });
  }
  if (path === "/api/events" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    response.write(`event: map\ndata: ${JSON.stringify({ version })}\n\n`);
    subscribers.add(response);
    request.on("close", () => subscribers.delete(response));
    return;
  }
  if (path === "/api/burgs" && request.method === "GET") {
    const burgs = await call("listBurgs");
    const query = (url.searchParams.get("q") ?? "").toLowerCase();
    return json(response, 200, { version, burgs: query ? burgs.filter(b => b.name?.toLowerCase().includes(query)) : burgs });
  }
  const match = path.match(/^\/api\/burgs\/(\d+)(\/descriptor)?$/);
  if (match && request.method === "GET") {
    const descriptor = await call("getDescriptor", Number(match[1]));
    if (!descriptor) return json(response, 404, { error: `no burg ${match[1]}` });
    return json(response, 200, { version, descriptor });
  }
  json(response, 404, { error: "not found" });
}

createServer((request, response) =>
  handle(request, response).catch(error => json(response, error.status ?? 500, { error: error.message }))
).listen(port, host, () => log(`http://${host}:${port}  map=${mapPath}  editor=${editorToken ? "token" : "disabled"}`));
tryReload(mapPath).then(
  worker => {
    version = hashFile(mapPath);
    adopt(worker, "startup");
  },
  error => {
    log(`cannot load ${mapPath}: ${error.message.split("\n")[0]}`);
    process.exit(1);
  }
);
