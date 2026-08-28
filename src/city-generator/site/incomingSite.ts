// M3 — FMG world map → City Generator hand-off.
//
// The Burg editor writes a BurgSiteDescriptor JSON to sessionStorage and opens
// this page in a fresh tab; `window.open` copies the opener's sessionStorage into
// the new same-origin browsing context, so the descriptor rides along. A
// descriptor may also arrive base64url-encoded in the URL fragment ("shareable
// link", design §3.1). Either way the S0–S3 pipeline runs on the real descriptor
// exactly as it does on a synthetic one (site/synthSite.ts) — siteInput.ts is
// the only adapter and it never distinguishes the two.
//
// No world-map imports: this file only knows the type-only BurgSiteDescriptor
// copy in ./burgSiteDescriptor (DESCRIPTOR_VERSION gates incompatible payloads).

import { type BurgSiteDescriptor, DESCRIPTOR_VERSION } from "./burgSiteDescriptor";

/** sessionStorage key the FMG Burg editor writes before `window.open`.
 * Keep in sync with src/controllers/burg-editor.ts (`openCityGenerator`). */
export const CITY_SITE_KEY = "fmg.citySite";

export type IncomingOrigin = "world" | "link";

export interface IncomingSite {
  descriptor: BurgSiteDescriptor;
  origin: IncomingOrigin;
}

/**
 * Parse + shape-check a descriptor JSON string. Returns null (logging why) on
 * malformed JSON or a `version` this build does not understand — the caller then
 * falls back to standalone mode rather than feeding the pipeline garbage.
 */
export function parseDescriptor(json: string): BurgSiteDescriptor | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    console.warn("City Generator: incoming site is not valid JSON");
    return null;
  }
  if (!isRecord(raw)) return warnShape("root object");
  if (raw.version !== DESCRIPTOR_VERSION) {
    console.warn(
      `City Generator: incoming descriptor version ${String(raw.version)} != expected ${DESCRIPTOR_VERSION}; ignoring`
    );
    return null;
  }
  if (!isRecord(raw.burg) || typeof raw.burg.seed !== "string") return warnShape("burg.seed");
  if (!isRecord(raw.frame) || !isFiniteNumber(raw.frame.extentMeters) || !isFiniteNumber(raw.frame.cityRadiusMeters)) {
    return warnShape("frame.extentMeters / frame.cityRadiusMeters");
  }
  if (!Array.isArray(raw.rivers) || !Array.isArray(raw.roads)) return warnShape("rivers[] / roads[]");
  if (raw.waterbody !== null && !isRecord(raw.waterbody)) return warnShape("waterbody");
  return raw as unknown as BurgSiteDescriptor;
}

/** base64url(JSON(descriptor)) — the payload a shareable `city/#…` link carries. */
export function encodeDescriptor(descriptor: BurgSiteDescriptor): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(descriptor)));
}

/** Inverse of `encodeDescriptor`; null on a corrupt token or an unusable descriptor. */
export function decodeDescriptor(token: string): BurgSiteDescriptor | null {
  let json: string;
  try {
    json = new TextDecoder().decode(fromBase64Url(token));
  } catch {
    console.warn("City Generator: shareable-link payload is not valid base64url");
    return null;
  }
  return parseDescriptor(json);
}

/** Full `origin + path + #<payload>` URL that reopens `descriptor` as a link. */
export function siteLinkFor(descriptor: BurgSiteDescriptor, base = locationBase()): string {
  return `${base}#${encodeDescriptor(descriptor)}`;
}

export interface IncomingLookup {
  /** `location.hash`, with or without the leading '#'. */
  hash?: string | null;
  /** `sessionStorage['fmg.citySite']`. */
  session?: string | null;
}

/** Pure resolver. A fragment payload (explicit link) wins over a stashed
 * hand-off; a malformed fragment falls through to the stash. */
export function resolveIncomingSite(lookup: IncomingLookup): IncomingSite | null {
  const token = (lookup.hash ?? "").replace(/^#/, "").trim();
  if (token) {
    const descriptor = decodeDescriptor(token);
    if (descriptor) return { descriptor, origin: "link" };
  }
  if (lookup.session) {
    const descriptor = parseDescriptor(lookup.session);
    if (descriptor) return { descriptor, origin: "world" };
  }
  return null;
}

/** Read the descriptor handed off by the world map (or carried in a link). */
export function readIncomingSite(): IncomingSite | null {
  return resolveIncomingSite({
    hash: typeof location === "undefined" ? "" : location.hash,
    session: safeSessionGet(CITY_SITE_KEY)
  });
}

// --- helpers -----------------------------------------------------------------

function safeSessionGet(key: string): string | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function locationBase(): string {
  return typeof location === "undefined" ? "" : location.origin + location.pathname;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function warnShape(what: string): null {
  console.warn(`City Generator: incoming descriptor is missing or malformed at ${what}`);
  return null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): Uint8Array {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (token.length % 4)) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
