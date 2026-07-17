import JSZip from "jszip";
import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import type { PresentationData } from "./presentationData";

export const WORLD_ARCHIVE_FORMAT = "fantasy-map-generator";
export const WORLD_ARCHIVE_SCHEMA_VERSION = 1;

export interface CoreReference {
  readonly kind: string;
  readonly id: number;
  readonly onDelete: "restrict" | "orphan";
}

/**
 * An extension payload the current host cannot interpret. The codec owns its
 * path and checksum, while the runtime retains these bytes unchanged.
 */
export interface OpaqueExtensionChunk {
  readonly extensionId: string;
  readonly schemaVersion: number;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly checksum: string;
  readonly coreReferences: readonly CoreReference[] | "unknown";
}

/** A DOM-free, full-fidelity snapshot of the current compatibility backing stores. */
export interface WorldDocument {
  readonly format: typeof WORLD_ARCHIVE_FORMAT;
  readonly schemaVersion: typeof WORLD_ARCHIVE_SCHEMA_VERSION;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly world: WorldContext;
  readonly simulation: SimulationContext;
  readonly presentation: PresentationData;
  readonly opaqueExtensionChunks: readonly OpaqueExtensionChunk[];
}

export interface RawArchive {
  readonly header: Uint8Array;
  readonly blob: Blob;
}

export interface StagedWorld {
  readonly stage: "decoded";
  readonly document: WorldDocument;
}

export interface MigratedWorld {
  readonly stage: "migrated";
  readonly document: WorldDocument;
}

export interface ValidatedWorld {
  readonly stage: "validated";
  readonly document: WorldDocument;
}

export interface WorldArchiveCodec {
  readonly id: string;
  canDecode(header: Uint8Array): boolean;
  decode(archive: RawArchive): Promise<StagedWorld>;
  encode(document: WorldDocument): Promise<Blob>;
}

export interface WorldMigrationPipeline {
  migrate(staged: StagedWorld): Promise<MigratedWorld>;
  validate(migrated: MigratedWorld): Promise<ValidatedWorld>;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue };

interface TypedArrayDescriptor {
  readonly path: string;
  readonly type: TypedArrayType;
  readonly byteLength: number;
  readonly checksum: string;
}

interface OpaqueChunkManifest {
  readonly extensionId: string;
  readonly schemaVersion: number;
  readonly mediaType: string;
  readonly path: string;
  readonly checksum: string;
  readonly coreReferences: readonly CoreReference[] | "unknown";
}

interface ArchiveManifest {
  readonly format: typeof WORLD_ARCHIVE_FORMAT;
  readonly schemaVersion: number;
  readonly appVersion: string;
  readonly endian: "little";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly identity: { readonly mapId: number; readonly seed: string };
  readonly typedArrays: readonly TypedArrayDescriptor[];
  readonly opaqueExtensionChunks: readonly OpaqueChunkManifest[];
}

type TypedArrayType =
  | "Int8Array"
  | "Uint8Array"
  | "Uint8ClampedArray"
  | "Int16Array"
  | "Uint16Array"
  | "Int32Array"
  | "Uint32Array"
  | "Float32Array"
  | "Float64Array";

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

const TYPED_ARRAY_TYPES = new Set<TypedArrayType>([
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array"
]);

const textDecoder = new TextDecoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTypedArray(value: unknown): value is TypedArray {
  return (
    ArrayBuffer.isView(value) &&
    !(value instanceof DataView) &&
    TYPED_ARRAY_TYPES.has(value.constructor.name as TypedArrayType)
  );
}

function typedArrayType(value: TypedArray): TypedArrayType {
  const type = value.constructor.name as TypedArrayType;
  if (!TYPED_ARRAY_TYPES.has(type)) throw new Error(`Unsupported typed array ${value.constructor.name}`);
  return type;
}

function typedArrayFromBytes(type: TypedArrayType, bytes: Uint8Array): TypedArray {
  const buffer = bytes.slice().buffer;
  switch (type) {
    case "Int8Array":
      return new Int8Array(buffer);
    case "Uint8Array":
      return new Uint8Array(buffer);
    case "Uint8ClampedArray":
      return new Uint8ClampedArray(buffer);
    case "Int16Array":
      return new Int16Array(buffer);
    case "Uint16Array":
      return new Uint16Array(buffer);
    case "Int32Array":
      return new Int32Array(buffer);
    case "Uint32Array":
      return new Uint32Array(buffer);
    case "Float32Array":
      return new Float32Array(buffer);
    case "Float64Array":
      return new Float64Array(buffer);
  }
}

async function checksum(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function assertChecksum(path: string, expected: string, actual: string): void {
  if (expected !== actual) throw new Error(`Archive checksum mismatch for ${path}`);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function parseManifest(value: unknown): ArchiveManifest {
  if (!isRecord(value)) throw new Error("Archive manifest is not an object");
  if (value.format !== WORLD_ARCHIVE_FORMAT) throw new Error("Unsupported archive format");
  if (value.schemaVersion !== WORLD_ARCHIVE_SCHEMA_VERSION) {
    throw new Error(`Unsupported archive schema ${String(value.schemaVersion)}`);
  }
  if (!Array.isArray(value.typedArrays) || !Array.isArray(value.opaqueExtensionChunks) || !isRecord(value.identity)) {
    throw new Error("Archive manifest is incomplete");
  }
  return value as unknown as ArchiveManifest;
}

function parseTypedArrayDescriptor(value: unknown): TypedArrayDescriptor {
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.type !== "string") {
    throw new Error("Invalid typed-array descriptor");
  }
  if (!TYPED_ARRAY_TYPES.has(value.type as TypedArrayType) || typeof value.byteLength !== "number") {
    throw new Error("Invalid typed-array descriptor type");
  }
  if (typeof value.checksum !== "string") throw new Error("Typed-array descriptor has no checksum");
  return value as unknown as TypedArrayDescriptor;
}

function safeProperty(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, value, writable: true });
}

interface EncodingContext {
  readonly typedArrays: TypedArrayDescriptor[];
  readonly bytes: Map<string, Uint8Array>;
  nextTypedArray: number;
}

async function encodeValue(value: unknown, context: EncodingContext, seen: WeakSet<object>): Promise<JsonValue> {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  if (value === undefined) return { $undefined: true };
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    throw new Error(`Archive cannot serialize ${typeof value}`);
  }
  if (isTypedArray(value)) {
    const type = typedArrayType(value);
    const path = `typed-arrays/${context.nextTypedArray++}.bin`;
    const bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    const descriptor: TypedArrayDescriptor = {
      path,
      type,
      byteLength: bytes.byteLength,
      checksum: await checksum(bytes)
    };
    context.typedArrays.push(descriptor);
    context.bytes.set(path, bytes);
    return { $typedArray: path };
  }
  if (!isRecord(value) && !Array.isArray(value)) throw new Error("Archive only supports plain records and arrays");
  if (seen.has(value)) throw new Error("Archive cannot serialize cyclic values");
  seen.add(value);
  if (Array.isArray(value)) {
    const encoded = await Promise.all(value.map(item => encodeValue(item, context, seen)));
    seen.delete(value);
    return encoded;
  }
  const encoded: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) safeProperty(encoded, key, await encodeValue(entry, context, seen));
  seen.delete(value);
  return encoded;
}

function decodeValue(
  value: unknown,
  descriptors: ReadonlyMap<string, TypedArrayDescriptor>,
  bytes: ReadonlyMap<string, Uint8Array>
): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  if (Array.isArray(value)) return value.map(item => decodeValue(item, descriptors, bytes));
  if (!isRecord(value)) throw new Error("Archive JSON value is invalid");
  if (value.$undefined === true && Object.keys(value).length === 1) return undefined;
  if (typeof value.$typedArray === "string" && Object.keys(value).length === 1) {
    const descriptor = descriptors.get(value.$typedArray);
    const payload = bytes.get(value.$typedArray);
    if (!descriptor || !payload) throw new Error(`Typed-array chunk ${value.$typedArray} is missing`);
    if (payload.byteLength !== descriptor.byteLength)
      throw new Error(`Typed-array chunk ${descriptor.path} has invalid length`);
    return typedArrayFromBytes(descriptor.type, payload);
  }
  const decoded: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) safeProperty(decoded, key, decodeValue(entry, descriptors, bytes));
  return decoded;
}

function validateWorldDocument(value: unknown): asserts value is WorldDocument {
  if (
    !isRecord(value) ||
    value.format !== WORLD_ARCHIVE_FORMAT ||
    value.schemaVersion !== WORLD_ARCHIVE_SCHEMA_VERSION
  ) {
    throw new Error("Archive document has an invalid format marker");
  }
  if (!isRecord(value.world) || !isRecord(value.simulation) || !isRecord(value.presentation)) {
    throw new Error("Archive document is missing world state");
  }
  if (!Array.isArray(value.opaqueExtensionChunks)) throw new Error("Archive document has invalid extension chunks");
  const world = value.world as Partial<WorldContext>;
  if (
    typeof world.mapId !== "number" ||
    typeof world.seed !== "string" ||
    !isRecord(world.pack) ||
    !isRecord(world.grid)
  ) {
    throw new Error("Archive world state is incomplete");
  }
}

/** ZIP codec. Typed arrays are stored as binary chunks, never decimal JSON strings. */
export class ChunkedWorldCodecAdapter implements WorldArchiveCodec {
  readonly id = "chunked-world";

  constructor(private readonly appVersion = "runtime") {}

  canDecode(header: Uint8Array): boolean {
    return header.length >= 4 && header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
  }

  async encode(document: WorldDocument): Promise<Blob> {
    validateWorldDocument(document);
    const context: EncodingContext = { typedArrays: [], bytes: new Map(), nextTypedArray: 0 };
    const seen = new WeakSet<object>();
    const [world, simulation, presentation] = await Promise.all([
      encodeValue(document.world, context, seen),
      encodeValue(document.simulation, context, seen),
      encodeValue(document.presentation, context, seen)
    ]);

    const opaqueExtensionChunks: OpaqueChunkManifest[] = [];
    for (const [index, chunk] of document.opaqueExtensionChunks.entries()) {
      const path = `extensions/${encodeURIComponent(chunk.extensionId)}/${index}.bin`;
      const bytes = chunk.bytes.slice();
      const actualChecksum = await checksum(bytes);
      assertChecksum(path, chunk.checksum, actualChecksum);
      opaqueExtensionChunks.push({
        extensionId: chunk.extensionId,
        schemaVersion: chunk.schemaVersion,
        mediaType: chunk.mediaType,
        path,
        checksum: actualChecksum,
        coreReferences: chunk.coreReferences
      });
      context.bytes.set(path, bytes);
    }

    const manifest: ArchiveManifest = {
      format: WORLD_ARCHIVE_FORMAT,
      schemaVersion: WORLD_ARCHIVE_SCHEMA_VERSION,
      appVersion: this.appVersion,
      endian: "little",
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      identity: { mapId: document.world.mapId, seed: document.world.seed },
      typedArrays: context.typedArrays,
      opaqueExtensionChunks
    };
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(manifest));
    zip.file("map/world.json", JSON.stringify(world));
    zip.file("simulation/core.json", JSON.stringify(simulation));
    zip.file("presentation.json", JSON.stringify(presentation));
    // Base64 is only JSZip's input transport. It writes these entries as raw
    // bytes, avoiding cross-realm ArrayBuffer checks in browser test runners.
    for (const [path, bytes] of context.bytes) zip.file(path, encodeBase64(bytes), { base64: true });
    return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  }

  async decode(archive: RawArchive): Promise<StagedWorld> {
    if (!this.canDecode(archive.header)) throw new Error("Not a .fmg ZIP archive");
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    const manifestFile = zip.file("manifest.json");
    const worldFile = zip.file("map/world.json");
    const simulationFile = zip.file("simulation/core.json");
    const presentationFile = zip.file("presentation.json");
    if (!manifestFile || !worldFile || !simulationFile || !presentationFile)
      throw new Error("Archive is missing a required chunk");
    const manifest = parseManifest(JSON.parse(await manifestFile.async("text")));
    const descriptors = new Map<string, TypedArrayDescriptor>();
    const bytes = new Map<string, Uint8Array>();
    for (const rawDescriptor of manifest.typedArrays) {
      const descriptor = parseTypedArrayDescriptor(rawDescriptor);
      if (descriptors.has(descriptor.path)) throw new Error(`Duplicate archive chunk ${descriptor.path}`);
      const file = zip.file(descriptor.path);
      if (!file) throw new Error(`Archive is missing ${descriptor.path}`);
      const payload = await file.async("uint8array");
      assertChecksum(descriptor.path, descriptor.checksum, await checksum(payload));
      descriptors.set(descriptor.path, descriptor);
      bytes.set(descriptor.path, payload);
    }
    const opaqueExtensionChunks: OpaqueExtensionChunk[] = [];
    for (const rawOpaque of manifest.opaqueExtensionChunks) {
      if (!isRecord(rawOpaque) || typeof rawOpaque.path !== "string" || typeof rawOpaque.extensionId !== "string") {
        throw new Error("Invalid extension chunk manifest");
      }
      const file = zip.file(rawOpaque.path);
      if (!file || typeof rawOpaque.checksum !== "string") throw new Error(`Archive is missing ${rawOpaque.path}`);
      const payload = await file.async("uint8array");
      assertChecksum(rawOpaque.path, rawOpaque.checksum, await checksum(payload));
      if (typeof rawOpaque.schemaVersion !== "number" || typeof rawOpaque.mediaType !== "string") {
        throw new Error("Invalid extension chunk manifest");
      }
      opaqueExtensionChunks.push({
        extensionId: rawOpaque.extensionId,
        schemaVersion: rawOpaque.schemaVersion,
        mediaType: rawOpaque.mediaType,
        bytes: payload,
        checksum: rawOpaque.checksum,
        coreReferences: Array.isArray(rawOpaque.coreReferences)
          ? (rawOpaque.coreReferences as CoreReference[])
          : "unknown"
      });
    }
    const document: unknown = {
      format: WORLD_ARCHIVE_FORMAT,
      schemaVersion: WORLD_ARCHIVE_SCHEMA_VERSION,
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt,
      world: decodeValue(JSON.parse(await worldFile.async("text")), descriptors, bytes),
      simulation: decodeValue(JSON.parse(await simulationFile.async("text")), descriptors, bytes),
      presentation: decodeValue(JSON.parse(await presentationFile.async("text")), descriptors, bytes),
      opaqueExtensionChunks
    };
    validateWorldDocument(document);
    return { stage: "decoded", document };
  }
}

/** The old positional `.map` representation remains a compatibility adapter. */
export class LegacyMapCodecAdapter {
  readonly id = "legacy-map";

  canDecode(header: Uint8Array): boolean {
    return !new ChunkedWorldCodecAdapter().canDecode(header);
  }

  /**
   * Stages the legacy positional payload without touching the DOM or contexts.
   * Its established migration/apply path remains in io/load.ts until each
   * positional slot has a schema-owned replacement in WorldDocument.
   */
  async decode(archive: RawArchive): Promise<{ readonly stage: "decoded"; readonly mapData: readonly string[] }> {
    let content: string;
    try {
      content = decodeLegacyText(new Uint8Array(await archive.blob.arrayBuffer()));
    } catch {
      const stream = archive.blob.stream().pipeThrough(new DecompressionStream("gzip"));
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) chunks.push(chunk as Uint8Array);
      const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      content = decodeLegacyText(bytes);
    }
    const svgMatch = content.match(/<svg[^>]*id="map"[\s\S]*?<\/svg>/);
    if (svgMatch?.[0].includes("\r\n")) content = content.replace(svgMatch[0], svgMatch[0].replace(/\r\n/g, "\n"));
    return { stage: "decoded", mapData: content.split("\r\n") };
  }
}

function decodeLegacyText(bytes: Uint8Array): string {
  const decoded = textDecoder.decode(bytes);
  return decoded.substring(0, 10).includes("|") ? decoded : decodeURIComponent(atob(decoded));
}

/** Current schema has no migrations yet; keeping the pipeline explicit makes additions atomic. */
export const worldMigrationPipeline: WorldMigrationPipeline = {
  async migrate(staged) {
    return { stage: "migrated", document: staged.document };
  },
  async validate(migrated) {
    validateWorldDocument(migrated.document);
    return { stage: "validated", document: migrated.document };
  }
};

export async function decodeAndValidateWorldArchive(archive: RawArchive): Promise<ValidatedWorld> {
  const staged = await new ChunkedWorldCodecAdapter().decode(archive);
  return worldMigrationPipeline.validate(await worldMigrationPipeline.migrate(staged));
}

export function createWorldDocument(
  world: WorldContext,
  simulation: SimulationContext,
  presentation: PresentationData,
  opaqueExtensionChunks: readonly OpaqueExtensionChunk[]
): WorldDocument {
  const now = new Date().toISOString();
  return structuredClone({
    format: WORLD_ARCHIVE_FORMAT,
    schemaVersion: WORLD_ARCHIVE_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    world,
    simulation,
    presentation,
    opaqueExtensionChunks
  });
}
