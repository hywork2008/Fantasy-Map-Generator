import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import {
  CORE_ENTITY_KINDS,
  type CoreEntityKind,
  type CoreReference,
  type OpaqueExtensionChunk
} from "./extensionArchiveTypes";

/** Minimal archive document surface needed for promote / demote migrations. */
export interface ExtensionArchiveDocument {
  readonly world: WorldContext;
  readonly simulation: SimulationContext;
  readonly opaqueExtensionChunks: readonly OpaqueExtensionChunk[];
}

/**
 * Host-owned media type for structured extension slices demoted to opaque
 * chunks. Payload is UTF-8 JSON with TypedArray markers (see encode/decode).
 */
export const EXTENSION_SLICE_MEDIA_TYPE = "application/vnd.fmg.extension-slice+json";

/**
 * Schema / validation / migration contract for one extension-owned runtime
 * slice. Extensions register this via ExtensionAPI.registerStateSlice(); the
 * host owns archive container paths and opaque byte round-trips.
 */
export interface ExtensionStateSliceSpec {
  readonly extensionId: string;
  /** Current schema version written for this slice. */
  readonly schemaVersion: number;
  /** Empty / default runtime slice used when the extension first materialises state. */
  readonly defaultState: () => Record<string, unknown>;
  /**
   * Validates a candidate slice against the current schema. Throws on invalid
   * data. `world` is the document being validated (archive preflight / promote).
   */
  readonly validate: (value: unknown, world: WorldContext) => void;
  /**
   * Migrates a payload from `fromVersion` toward the current schemaVersion.
   * Called before validate during opaque promotion and archive migration.
   */
  readonly migrate: (fromVersion: number, value: unknown) => unknown;
  /**
   * Host-readable core entity references held by a validated slice. Used for
   * delete/merge policy while the extension is installed, and stored on the
   * opaque envelope when the slice is demoted.
   */
  readonly collectCoreReferences: (slice: Record<string, unknown>) => readonly CoreReference[];
  /**
   * Optional custom binary codec. Default is structured JSON with TypedArray
   * markers so host never needs extension field names in the ZIP layout.
   */
  readonly encode?: (slice: Record<string, unknown>) => Uint8Array;
  readonly decode?: (bytes: Uint8Array) => unknown;
  readonly mediaType?: string;
}

const registry = new Map<string, ExtensionStateSliceSpec>();

const TYPED_ARRAY_MARKER = "__fmgTypedArray";

type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTypedArray(value: unknown): value is TypedArray {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function encodeStructuredValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (isTypedArray(value)) {
    return {
      [TYPED_ARRAY_MARKER]: value.constructor.name,
      data: Array.from(value as ArrayLike<number>)
    };
  }
  if (Array.isArray(value)) return value.map(encodeStructuredValue);
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = encodeStructuredValue(entry);
  }
  return out;
}

function restoreTypedArray(type: string, data: number[]): TypedArray {
  switch (type) {
    case "Int8Array":
      return new Int8Array(data);
    case "Uint8Array":
      return new Uint8Array(data);
    case "Uint8ClampedArray":
      return new Uint8ClampedArray(data);
    case "Int16Array":
      return new Int16Array(data);
    case "Uint16Array":
      return new Uint16Array(data);
    case "Int32Array":
      return new Int32Array(data);
    case "Uint32Array":
      return new Uint32Array(data);
    case "Float32Array":
      return new Float32Array(data);
    case "Float64Array":
      return new Float64Array(data);
    default:
      throw new Error(`Unsupported typed array type in extension slice: ${type}`);
  }
}

function decodeStructuredValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(decodeStructuredValue);
  if (isRecord(value) && typeof value[TYPED_ARRAY_MARKER] === "string" && Array.isArray(value.data)) {
    return restoreTypedArray(value[TYPED_ARRAY_MARKER], value.data as number[]);
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = decodeStructuredValue(entry);
  }
  return out;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeExtensionSlicePayload(spec: ExtensionStateSliceSpec, slice: Record<string, unknown>): Uint8Array {
  if (spec.encode) return spec.encode(slice);
  return textEncoder.encode(JSON.stringify(encodeStructuredValue(slice)));
}

export function decodeExtensionSlicePayload(spec: ExtensionStateSliceSpec, bytes: Uint8Array): unknown {
  if (spec.decode) return spec.decode(bytes);
  return decodeStructuredValue(JSON.parse(textDecoder.decode(bytes)));
}

export async function checksumBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function getRegisteredStateSlice(extensionId: string): ExtensionStateSliceSpec | undefined {
  return registry.get(extensionId);
}

export function listRegisteredStateSlices(): readonly ExtensionStateSliceSpec[] {
  return [...registry.values()];
}

export function isStateSliceRegistered(extensionId: string): boolean {
  return registry.has(extensionId);
}

/**
 * Registers schema ownership for an extension slice. Throws if the same id is
 * already registered to a different spec instance.
 */
export function registerStateSliceSpec(spec: ExtensionStateSliceSpec): () => void {
  if (!spec.extensionId.trim()) throw new Error("State slice registration requires a non-empty extension id");
  if (!Number.isInteger(spec.schemaVersion) || spec.schemaVersion < 1) {
    throw new Error(`State slice ${spec.extensionId} requires a positive integer schemaVersion`);
  }
  const existing = registry.get(spec.extensionId);
  if (existing && existing !== spec) {
    throw new Error(`State slice ${spec.extensionId} is already registered`);
  }
  registry.set(spec.extensionId, spec);
  return () => {
    if (registry.get(spec.extensionId) === spec) registry.delete(spec.extensionId);
  };
}

/** Test helper: drop every registered slice. */
export function clearRegisteredStateSlices(): void {
  registry.clear();
}

function assertCoreReferenceList(references: readonly CoreReference[], extensionId: string): void {
  for (const reference of references) {
    if (
      !CORE_ENTITY_KINDS.includes(reference.kind) ||
      !Number.isInteger(reference.id) ||
      reference.id < 0 ||
      (reference.onDelete !== "restrict" && reference.onDelete !== "orphan")
    ) {
      throw new Error(`Extension ${extensionId} produced an invalid core reference`);
    }
  }
}

/**
 * Validates registered extension slices with their own validators. Unknown
 * unregistered ids remain safe record containers (demotion is migration's job).
 * Host-known built-in field checks in extensionStateSlices remain authoritative
 * for the four built-ins; this path mainly covers dynamic registrations.
 */
export function assertRegisteredExtensionStateSlices(world: WorldContext, simulation: SimulationContext): void {
  if (!simulation.extensions || !isRecord(simulation.extensions)) return;
  for (const [extensionId, slice] of Object.entries(simulation.extensions)) {
    assertRecord(slice, `simulation.extensions.${extensionId}`);
    const spec = registry.get(extensionId);
    if (!spec) continue;
    // Built-in host checks already ran in assertValidExtensionStateSlices; still
    // require collectCoreReferences to be well-formed for delete policy.
    if (
      extensionId === "characters" ||
      extensionId === "economy" ||
      extensionId === "nobility" ||
      extensionId === "shipbuilding"
    ) {
      assertCoreReferenceList(spec.collectCoreReferences(slice), extensionId);
      continue;
    }
    spec.validate(slice, world);
    assertCoreReferenceList(spec.collectCoreReferences(slice), extensionId);
  }
}

function assertRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Archive ${name} must be a record`);
}

/**
 * Migrates, validates, and installs one opaque chunk into a runtime slice.
 * Returns null when the chunk cannot be promoted (wrong media type / invalid).
 */
export function tryPromoteOpaqueChunk(
  chunk: OpaqueExtensionChunk,
  world: WorldContext
): { readonly extensionId: string; readonly slice: Record<string, unknown> } | null {
  const spec = registry.get(chunk.extensionId);
  if (!spec) return null;
  const mediaType = chunk.mediaType || EXTENSION_SLICE_MEDIA_TYPE;
  const expectedMedia = spec.mediaType ?? EXTENSION_SLICE_MEDIA_TYPE;
  if (mediaType !== expectedMedia && mediaType !== EXTENSION_SLICE_MEDIA_TYPE) {
    // Binary foreign payloads stay opaque until the extension provides decode.
    if (!spec.decode) return null;
  }
  try {
    const decoded = decodeExtensionSlicePayload(spec, chunk.bytes);
    const migrated = spec.migrate(chunk.schemaVersion, decoded);
    spec.validate(migrated, world);
    if (!isRecord(migrated)) throw new Error("migrated slice must be a record");
    assertCoreReferenceList(spec.collectCoreReferences(migrated), chunk.extensionId);
    return { extensionId: chunk.extensionId, slice: migrated };
  } catch {
    // Failed promotion must leave world state unchanged.
    return null;
  }
}

/**
 * Promotes every opaque chunk whose extension is registered and whose payload
 * validates. Unpromoted chunks are retained byte-for-byte.
 */
export function promoteRegisteredOpaqueChunks<T extends ExtensionArchiveDocument>(document: T): T {
  if (!document.opaqueExtensionChunks.length) return document;
  const extensions: Record<string, Record<string, unknown>> = {
    ...(isRecord(document.simulation.extensions) ? document.simulation.extensions : {})
  };
  const remaining: OpaqueExtensionChunk[] = [];
  let changed = false;

  for (const chunk of document.opaqueExtensionChunks) {
    if (extensions[chunk.extensionId]) {
      // Already have a runtime slice for this extension — keep the opaque
      // payload so a second install path cannot overwrite live data blindly.
      remaining.push(chunk);
      continue;
    }
    const promoted = tryPromoteOpaqueChunk(chunk, document.world);
    if (!promoted) {
      remaining.push(chunk);
      continue;
    }
    extensions[promoted.extensionId] = promoted.slice;
    changed = true;
  }

  if (!changed) return document;
  return {
    ...document,
    simulation: {
      ...document.simulation,
      extensions
    },
    opaqueExtensionChunks: remaining
  };
}

/**
 * Moves unregistered simulation.extensions entries into opaque chunks so hosts
 * that lack the extension never treat them as validated runtime slices.
 */
export async function demoteUnregisteredExtensionSlices<T extends ExtensionArchiveDocument>(document: T): Promise<T> {
  if (!document.simulation.extensions || !isRecord(document.simulation.extensions)) return document;

  const extensions: Record<string, Record<string, unknown>> = { ...document.simulation.extensions };
  const opaque: OpaqueExtensionChunk[] = [...document.opaqueExtensionChunks];
  let changed = false;

  for (const [extensionId, slice] of Object.entries(extensions)) {
    if (registry.has(extensionId)) continue;
    if (!isRecord(slice)) continue;

    // Prefer an explicit demotion codec when the extension later re-registers
    // with the same structured media type. collectCoreReferences is unknown.
    const bytes = textEncoder.encode(JSON.stringify(encodeStructuredValue(slice)));
    opaque.push({
      extensionId,
      schemaVersion: 1,
      mediaType: EXTENSION_SLICE_MEDIA_TYPE,
      bytes,
      checksum: await checksumBytes(bytes),
      coreReferences: "unknown"
    });
    delete extensions[extensionId];
    changed = true;
  }

  if (!changed) return document;
  return {
    ...document,
    simulation: {
      ...document.simulation,
      extensions
    },
    opaqueExtensionChunks: opaque
  };
}

/**
 * Demotes a registered runtime slice to an opaque chunk, capturing current
 * core references so delete policy survives after the extension unregisters.
 */
export async function demoteRegisteredSliceToOpaque(
  extensionId: string,
  slice: Record<string, unknown>,
  world: WorldContext
): Promise<OpaqueExtensionChunk> {
  const spec = registry.get(extensionId);
  if (!spec) {
    const bytes = textEncoder.encode(JSON.stringify(encodeStructuredValue(slice)));
    return {
      extensionId,
      schemaVersion: 1,
      mediaType: EXTENSION_SLICE_MEDIA_TYPE,
      bytes,
      checksum: await checksumBytes(bytes),
      coreReferences: "unknown"
    };
  }
  spec.validate(slice, world);
  const references = spec.collectCoreReferences(slice);
  assertCoreReferenceList(references, extensionId);
  const bytes = encodeExtensionSlicePayload(spec, slice);
  return {
    extensionId,
    schemaVersion: spec.schemaVersion,
    mediaType: spec.mediaType ?? EXTENSION_SLICE_MEDIA_TYPE,
    bytes,
    checksum: await checksumBytes(bytes),
    coreReferences: references
  };
}

/**
 * Rejects core deletions that would break restrict references held by live
 * registered slices. Orphan references remain allowed (tombstones keep IDs).
 */
export function assertRegisteredSliceCoreDeletesAllowed(
  simulation: SimulationContext,
  deleted: readonly Pick<CoreReference, "kind" | "id">[]
): void {
  if (!deleted.length || !simulation.extensions || !isRecord(simulation.extensions)) return;
  for (const [extensionId, slice] of Object.entries(simulation.extensions)) {
    const spec = registry.get(extensionId);
    if (!spec || !isRecord(slice)) continue;
    let references: readonly CoreReference[];
    try {
      references = spec.collectCoreReferences(slice);
    } catch {
      // A slice that cannot report references is treated like unknown opaque.
      throw new Error(`Cannot delete core entities while extension ${extensionId} has unreadable references`);
    }
    for (const target of deleted) {
      const restricted = references.find(
        reference => reference.kind === target.kind && reference.id === target.id && reference.onDelete === "restrict"
      );
      if (restricted) {
        throw new Error(`Cannot delete ${target.kind} ${target.id}; extension ${extensionId} restricts that reference`);
      }
    }
  }
}

/** Convenience for tests and built-ins: collect only positive integer entity ids. */
export function collectEntityReferences(
  values: unknown,
  kind: CoreEntityKind,
  onDelete: CoreReference["onDelete"] = "restrict"
): CoreReference[] {
  const refs: CoreReference[] = [];
  const seen = new Set<number>();

  const addId = (value: number): void => {
    if (!Number.isInteger(value) || value <= 0 || seen.has(value)) return;
    seen.add(value);
    refs.push({ kind, id: value, onDelete });
  };

  const visit = (value: unknown): void => {
    if (typeof value === "number") {
      addId(value);
      return;
    }
    if (typeof value === "string" && value.trim() !== "" && Number.isInteger(Number(value))) {
      addId(Number(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (isRecord(value)) {
      // Entity-keyed records contribute their keys when the value is present.
      // Compatibility projections may materialise `{ [id]: undefined }` slots;
      // those are not live references.
      for (const [key, entry] of Object.entries(value)) {
        if (entry !== undefined && entry !== null && Number.isInteger(Number(key))) {
          addId(Number(key));
        }
        visit(entry);
      }
    }
  };

  visit(values);
  return refs;
}
