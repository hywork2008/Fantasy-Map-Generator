/**
 * Client for the simulation channel server (`npm run sim:server`, docs/plan/simulation-channel-server.md §13).
 * Publishing copies the current map into a new server channel, which AI agents and scripts then
 * read and advance over REST. Every call fails soft when no server answers.
 */

const TOKEN_KEY = "fmg.simServer.token";
const configured = (import.meta.env.VITE_SIM_SERVER as string | undefined)?.replace(/\/$/, "");
/** Tried in order: the page's own origin (Vite proxy via FMG_SIM_SERVER), then the server's default address. */
const CANDIDATES = configured ? [configured] : ["", "http://127.0.0.1:8788"];
let base = CANDIDATES[0];

export interface PublishedChannel {
  id: string;
  name: string;
  api: string;
}

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeToken(token: string): void {
  try {
    token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the token is simply asked for again */
  }
}

/** Returns null when no simulation server is reachable. */
export async function probeSimServer(): Promise<{ auth: boolean } | null> {
  for (const candidate of CANDIDATES) {
    try {
      const response = await fetch(`${candidate}/api/sim/health`, { signal: AbortSignal.timeout(1500) });
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) continue;
      const body = (await response.json()) as { ok?: boolean; auth?: boolean };
      if (!body.ok) continue;
      base = candidate;
      return { auth: Boolean(body.auth) };
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/**
 * Creates a new channel holding `archive`; the server picks the id (world-1, world-2, …).
 * `extensions` are the simulation extensions enabled here: enablement is browser state, not part
 * of the .fmg, and the channel must run the same set (an economy-less world cannot run Economy).
 */
export async function publishToSimServer(
  archive: Blob,
  name: string,
  extensions: readonly string[]
): Promise<PublishedChannel> {
  const status = await probeSimServer();
  if (!status) throw new Error("The simulation server is not reachable");
  if (status.auth && !readToken()) {
    const token = window.prompt("Simulation server token");
    if (!token) throw new Error("No simulation server token");
    writeToken(token);
  }
  const token = readToken();
  const response = await fetch(
    `${base}/api/sim/channels?name=${encodeURIComponent(name)}&extensions=${encodeURIComponent(extensions.join(","))}`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: archive
    }
  );
  const body = (await response.json().catch(() => ({}))) as Partial<PublishedChannel> & { error?: string };
  if (response.status === 401) writeToken("");
  if (!response.ok || !body.id) throw new Error(body.error ?? `Simulation server returned ${response.status}`);
  return { id: body.id, name: body.name ?? body.id, api: body.api ?? `${base}/api/sim/channels/${body.id}` };
}

export interface ChannelInfo {
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  date?: { year: number; month: number; day: number };
  counts?: Record<string, number>;
  extensions?: string[];
  running?: boolean;
}

/** Channels on the server; empty when none or no server answers. */
export async function listSimChannels(): Promise<ChannelInfo[]> {
  if (!(await probeSimServer())) return [];
  try {
    const response = await fetch(`${base}/api/sim/channels`);
    return response.ok ? ((await response.json()) as ChannelInfo[]) : [];
  } catch {
    return [];
  }
}

export async function fetchSimChannelArchive(id: string): Promise<Blob> {
  const response = await fetch(`${base}/api/sim/channels/${encodeURIComponent(id)}/archive`);
  if (!response.ok) throw new Error(`Simulation server returned ${response.status}`);
  return response.blob();
}

/** Anyone may delete a channel; the server needs no token for it. */
export async function deleteSimChannel(id: string): Promise<void> {
  const response = await fetch(`${base}/api/sim/channels/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Simulation server returned ${response.status}`);
}

export interface ChannelWatchHandlers {
  onRevision: (revision: number) => void;
  onDeleted: () => void;
}

/** Follows a channel's revisions over SSE. Returns the function that stops following. */
export function watchSimChannel(id: string, handlers: ChannelWatchHandlers): () => void {
  if (typeof EventSource === "undefined") return () => {};
  const source = new EventSource(`${base}/api/sim/channels/${encodeURIComponent(id)}/events`);
  source.addEventListener("revision", event => {
    const { revision } = JSON.parse((event as MessageEvent<string>).data) as { revision: number };
    handlers.onRevision(revision);
  });
  source.addEventListener("deleted", () => {
    source.close();
    handlers.onDeleted();
  });
  return () => source.close();
}
