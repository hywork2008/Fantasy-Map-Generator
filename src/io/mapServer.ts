/**
 * Client for the shared map server (`npm run map:server`, docs/plan/map-server.md).
 * The browser keeps working standalone: every call here fails soft when no server answers.
 * One editor (token holder) writes; any number of viewers read the same .fmg.
 */

const TOKEN_KEY = "fmg.mapServer.editorToken";
const base = (import.meta.env.VITE_MAP_SERVER as string | undefined)?.replace(/\/$/, "") ?? "";

export interface MapServerStatus {
  version: string;
  writable: boolean;
}

/** ETag of the map this tab last loaded from / saved to the server; sent as If-Match when saving. */
let knownVersion: string | null = null;

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

const authHeaders = (): Record<string, string> => {
  const token = readToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** Returns null when no map server is reachable (standalone browser mode). */
export async function probeMapServer(): Promise<MapServerStatus | null> {
  try {
    const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return null;
    const body = (await response.json()) as { ok?: boolean; version?: string; writable?: boolean };
    return body.ok ? { version: body.version ?? "", writable: Boolean(body.writable) } : null;
  } catch {
    return null;
  }
}

export async function fetchMapFromServer(): Promise<Blob> {
  const response = await fetch(`${base}/api/map`, { headers: authHeaders() });
  if (response.status === 401) {
    const token = window.prompt("Map server read token");
    if (!token) throw new Error("The map server requires a token");
    writeToken(token);
    return fetchMapFromServer();
  }
  if (!response.ok) throw new Error(`Map server returned ${response.status}`);
  knownVersion = response.headers.get("ETag");
  return response.blob();
}

export type SaveToServerResult = { ok: true; version: string } | { ok: false; status: number; message: string };

/** `knownVersion` null means this tab never loaded the server map; the save then needs a fresh version. */
export async function saveMapToServer(archive: Blob): Promise<SaveToServerResult> {
  if (readToken() === "") {
    const token = window.prompt("Map server editor token");
    if (!token) return { ok: false, status: 0, message: "No editor token" };
    writeToken(token);
  }
  const status = await probeMapServer();
  if (!status) return { ok: false, status: 0, message: "Map server is not reachable" };
  const response = await fetch(`${base}/api/map`, {
    method: "PUT",
    headers: { ...authHeaders(), "If-Match": knownVersion ?? status.version },
    body: archive
  });
  const body = (await response.json().catch(() => ({}))) as { version?: string; error?: string };
  if (response.status === 403) writeToken("");
  if (!response.ok) return { ok: false, status: response.status, message: body.error ?? `HTTP ${response.status}` };
  knownVersion = body.version ?? null;
  return { ok: true, version: body.version ?? "" };
}

/** Calls `onChange` when someone else replaces the server map. Returns an unsubscribe function. */
export function watchMapServer(onChange: (version: string) => void): () => void {
  if (typeof EventSource === "undefined") return () => {};
  const source = new EventSource(`${base}/api/events`);
  source.addEventListener("map", event => {
    const { version } = JSON.parse((event as MessageEvent<string>).data) as { version: string };
    if (knownVersion !== null && version !== knownVersion) onChange(version);
  });
  return () => source.close();
}
