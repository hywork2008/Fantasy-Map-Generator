// FMG world map → City Editor hand-off, and shareable-link reproduction.
//
// The Burg editor writes a BurgSiteDescriptor JSON to sessionStorage and opens
// this page in a fresh tab; `window.open` copies the opener's sessionStorage into
// the new same-origin browsing context. A payload may also arrive base64url-encoded
// in the URL fragment — either a raw BurgSiteDescriptor (City Generator's
// `city/#…` links) or a City Editor share that also carries seed, grid and
// generation settings so a standalone roll can be reproduced.
//
// No world-map imports: this file only knows the type-only BurgSiteDescriptor
// copy in core/gen/site/burgSiteDescriptor (DESCRIPTOR_VERSION gates incompatible
// payloads). Keep CITY_SITE_KEY in sync with src/controllers/burg-editor.ts.

import { type CitySizePreset, type GridKind, isCitySizePreset, sizePresetForExtent } from "../core/document";
import { type BurgSiteDescriptor, DESCRIPTOR_VERSION } from "../core/gen/site/burgSiteDescriptor";
import { DEFAULT_SITE_CONFIG } from "../core/gen/site/siteConfig";
import type { GenerationSettings } from "../core/generate";

/** sessionStorage key the FMG Burg editor writes before `window.open`. */
export const CITY_SITE_KEY = "fmg.citySite";

export const CITY_EDITOR_SHARE_KIND = "fmg-city-editor-share";
export const CITY_EDITOR_SHARE_VERSION = 1;

export type IncomingOrigin = "world" | "link";

export interface CityEditorShare {
  kind: typeof CITY_EDITOR_SHARE_KIND;
  version: 1;
  seed: string;
  grid: GridKind;
  size: CitySizePreset;
  hexSizeMeters?: number;
  gridSeed?: string;
  patchParams?: { nPatches: number; relaxCount: number; relaxPasses: number };
  settings: Omit<GenerationSettings, "descriptor">;
  descriptor?: BurgSiteDescriptor;
}

export interface IncomingCity {
  share: CityEditorShare;
  origin: IncomingOrigin;
}

export interface IncomingLookup {
  /** `location.hash`, with or without the leading '#'. */
  hash?: string | null;
  /** `sessionStorage['fmg.citySite']`. */
  session?: string | null;
}

/**
 * Parse + shape-check a descriptor JSON string. Returns null (logging why) on
 * malformed JSON or a `version` this build does not understand — the caller then
 * falls back to standalone mode rather than feeding the pipeline garbage.
 */
export function parseDescriptor(json: string): BurgSiteDescriptor | null {
  return asDescriptor(parseJson(json));
}

/** Parse a City Editor share, a raw BurgSiteDescriptor, or null. */
export function parseIncomingPayload(json: string): CityEditorShare | null {
  const raw = parseJson(json);
  const share = asShare(raw);
  if (share) return share;
  const descriptor = asDescriptor(raw);
  return descriptor ? shareFromDescriptor(descriptor) : null;
}

export function shareFromDescriptor(descriptor: BurgSiteDescriptor): CityEditorShare {
  return {
    kind: CITY_EDITOR_SHARE_KIND,
    version: CITY_EDITOR_SHARE_VERSION,
    seed: descriptor.burg.seed,
    grid: "evolution",
    size: sizePresetForExtent(descriptor.frame.extentMeters),
    gridSeed: descriptor.burg.seed,
    settings: { config: structuredClone(DEFAULT_SITE_CONFIG) },
    descriptor
  };
}

export function buildShare(input: {
  seed: string;
  grid: GridKind;
  size: CitySizePreset;
  hexSizeMeters?: number;
  gridSeed?: string;
  patchParams?: CityEditorShare["patchParams"];
  settings: GenerationSettings;
  descriptor?: BurgSiteDescriptor;
}): CityEditorShare {
  const { descriptor: _ignored, ...settings } = input.settings;
  const share: CityEditorShare = {
    kind: CITY_EDITOR_SHARE_KIND,
    version: CITY_EDITOR_SHARE_VERSION,
    seed: input.seed,
    grid: input.grid,
    size: input.size,
    settings: structuredClone(settings)
  };
  if (input.hexSizeMeters != null) share.hexSizeMeters = input.hexSizeMeters;
  if (input.gridSeed != null) share.gridSeed = input.gridSeed;
  if (input.patchParams) share.patchParams = { ...input.patchParams };
  if (input.descriptor) share.descriptor = structuredClone(input.descriptor);
  return share;
}

/** base64url(JSON(share or descriptor)) — the payload a `city-editor/#…` link carries. */
export function encodeShare(share: CityEditorShare): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(share)));
}

/** Inverse of `encodeShare`; also accepts a City Generator descriptor token. */
export function decodeShare(token: string): CityEditorShare | null {
  let json: string;
  try {
    json = new TextDecoder().decode(fromBase64Url(token));
  } catch {
    console.warn("City Editor: shareable-link payload is not valid base64url");
    return null;
  }
  return parseIncomingPayload(json);
}

/** Full `origin + path + #<payload>` URL that reopens `share`. */
export function cityLinkFor(share: CityEditorShare, base = locationBase()): string {
  return `${base}#${encodeShare(share)}`;
}

/** Pure resolver. A fragment payload (explicit link) wins over a stashed
 * hand-off; a malformed fragment falls through to the stash. */
export function resolveIncomingCity(lookup: IncomingLookup): IncomingCity | null {
  const token = (lookup.hash ?? "").replace(/^#/, "").trim();
  if (token) {
    const share = decodeShare(token);
    if (share) return { share, origin: "link" };
  }
  if (lookup.session) {
    const share = parseIncomingPayload(lookup.session);
    if (share) return { share, origin: "world" };
  }
  return null;
}

/** Read the descriptor/share handed off by the world map (or carried in a link). */
export function readIncomingCity(): IncomingCity | null {
  return resolveIncomingCity({
    hash: typeof location === "undefined" ? "" : location.hash,
    session: safeSessionGet(CITY_SITE_KEY)
  });
}

/** Drop the hand-off so a reload of this tab stays standalone. */
export function forgetIncomingCity(): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(CITY_SITE_KEY);
  } catch {
    /* storage blocked — nothing to clear */
  }
  if (typeof location !== "undefined" && location.hash) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

// --- helpers -----------------------------------------------------------------

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    console.warn("City Editor: incoming payload is not valid JSON");
    return null;
  }
}

function asDescriptor(raw: unknown): BurgSiteDescriptor | null {
  if (!isRecord(raw)) return warnShape("root object");
  if (raw.version !== DESCRIPTOR_VERSION) {
    if (raw.kind === CITY_EDITOR_SHARE_KIND) return null;
    console.warn(
      `City Editor: incoming descriptor version ${String(raw.version)} != expected ${DESCRIPTOR_VERSION}; ignoring`
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

function asShare(raw: unknown): CityEditorShare | null {
  if (!isRecord(raw)) return null;
  if (raw.kind !== CITY_EDITOR_SHARE_KIND) return null;
  if (raw.version !== CITY_EDITOR_SHARE_VERSION) {
    console.warn(
      `City Editor: incoming share version ${String(raw.version)} != expected ${CITY_EDITOR_SHARE_VERSION}; ignoring`
    );
    return null;
  }
  if (typeof raw.seed !== "string" || !raw.seed) return warnShape("share.seed");
  if (!isGridKind(raw.grid)) return warnShape("share.grid");
  if (!isSize(raw.size)) return warnShape("share.size");
  const settings = asSettings(raw.settings);
  if (!settings) return warnShape("share.settings");
  const share: CityEditorShare = {
    kind: CITY_EDITOR_SHARE_KIND,
    version: CITY_EDITOR_SHARE_VERSION,
    seed: raw.seed,
    grid: raw.grid,
    size: raw.size,
    settings
  };
  if (isFiniteNumber(raw.hexSizeMeters)) share.hexSizeMeters = raw.hexSizeMeters;
  if (typeof raw.gridSeed === "string" && raw.gridSeed) share.gridSeed = raw.gridSeed;
  const patch = asPatchParams(raw.patchParams);
  if (patch) share.patchParams = patch;
  if (raw.descriptor !== undefined) {
    const descriptor = asDescriptor(raw.descriptor);
    if (!descriptor) return warnShape("share.descriptor");
    share.descriptor = descriptor;
  }
  return share;
}

function asSettings(raw: unknown): Omit<GenerationSettings, "descriptor"> | null {
  if (!isRecord(raw)) return { config: structuredClone(DEFAULT_SITE_CONFIG) };
  const config = isRecord(raw.config)
    ? (raw.config as unknown as GenerationSettings["config"])
    : structuredClone(DEFAULT_SITE_CONFIG);
  const settings: Omit<GenerationSettings, "descriptor"> = { config };
  if (isFiniteNumber(raw.walledAreaShare)) settings.walledAreaShare = raw.walledAreaShare;
  if (isFiniteNumber(raw.urbanNPatches)) settings.urbanNPatches = raw.urbanNPatches;
  if (isRecord(raw.streets)) settings.streets = raw.streets as GenerationSettings["streets"];
  return settings;
}

function asPatchParams(raw: unknown): CityEditorShare["patchParams"] | undefined {
  if (!isRecord(raw)) return undefined;
  if (!isFiniteNumber(raw.nPatches) || !isFiniteNumber(raw.relaxCount) || !isFiniteNumber(raw.relaxPasses)) {
    return undefined;
  }
  return { nPatches: raw.nPatches, relaxCount: raw.relaxCount, relaxPasses: raw.relaxPasses };
}

function isGridKind(v: unknown): v is GridKind {
  return v === "hex" || v === "voronoi" || v === "evolution";
}

function isSize(v: unknown): v is CitySizePreset {
  return isCitySizePreset(v);
}

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
  console.warn(`City Editor: incoming payload is missing or malformed at ${what}`);
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
