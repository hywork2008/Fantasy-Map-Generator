import JSZip from "jszip";
import {
  createEmptyFrontierSimulationState,
  createEmptyWildernessEcologyState,
  FRONTIER_INVESTMENTS,
  type SimulationContext
} from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { ensureBiomeCatalogFields } from "../data/biomeCatalog";
import type { BiomesData } from "../types/WorldState";
import { normalizeFrontierStartMode } from "../utils/frontierStartMode";
import { normalizeInitialPolityRealmSize } from "../utils/initialPolityScope";
import { normalizeInitialSettlementPattern } from "../utils/initialSettlementPattern";
import {
  CORE_ENTITY_KINDS,
  type CoreEntityKind,
  type CoreReference,
  type OpaqueExtensionChunk
} from "./extensionArchiveTypes";
import {
  assertRegisteredExtensionStateSlices,
  demoteUnregisteredExtensionSlices,
  promoteRegisteredOpaqueChunks
} from "./extensionStateSliceRegistry";
import { assertValidExtensionStateSlices, removeExtensionStateSliceMirrors } from "./extensionStateSlices";
import type { PresentationData } from "./presentationData";
import { removeSimulationBurgStateMirrors } from "./simulationBurgState";
import { removeSimulationCellColumnMirrors } from "./simulationCellColumns";
import { removeSimulationMilitaryStateMirrors } from "./simulationMilitaryState";
import { assertValidSimulationRngState, createSimulationRngState } from "./simulationRng";
import { removeSimulationStateStateMirrors } from "./simulationStateState";

export const WORLD_ARCHIVE_FORMAT = "fantasy-map-generator";
/**
 * v2 adds the persisted initial settlement pattern. v1 archives are accepted
 * and normalized to the legacy-equivalent "standard" preset during decoding.
 */
export const WORLD_ARCHIVE_SCHEMA_VERSION = 2;
const SUPPORTED_WORLD_ARCHIVE_SCHEMA_VERSIONS = new Set([1, WORLD_ARCHIVE_SCHEMA_VERSION]);

export type { CoreEntityKind, CoreReference, OpaqueExtensionChunk };
export { CORE_ENTITY_KINDS };

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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 1-indexed entity tables (`pack.burgs`, historically `pack.features`, etc.).
 * Index 0 may be the sentinel number `0` or null/undefined rather than a record
 * (see Burgs.generate: `burgs = [0 as unknown as Burg]`).
 */
function assertEntityTableArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Archive ${name} must be an array`);
  }
  for (const [index, item] of value.entries()) {
    if (index === 0 && (item === 0 || item === null || item === undefined)) continue;
    if (!isRecord(item)) {
      throw new Error(`Archive ${name}[${index}] must be a record (index 0 may be a 0/null sentinel)`);
    }
  }
}

function assertOpaqueReferences(value: readonly OpaqueExtensionChunk[]): void {
  for (const chunk of value) {
    if (!chunk.extensionId.trim() || !Number.isInteger(chunk.schemaVersion) || !chunk.mediaType) {
      throw new Error("Archive extension chunk has invalid metadata");
    }
    if (chunk.coreReferences === "unknown") continue;
    for (const reference of chunk.coreReferences) {
      if (
        !CORE_ENTITY_KINDS.includes(reference.kind) ||
        !Number.isInteger(reference.id) ||
        reference.id < 0 ||
        (reference.onDelete !== "restrict" && reference.onDelete !== "orphan")
      ) {
        throw new Error("Archive extension chunk has an invalid core reference");
      }
    }
  }
}

/**
 * Rejects a core deletion when a retained opaque extension payload cannot be
 * updated safely. `unknown` manifests block all deletes and merges; `orphan`
 * references are safe because the core table retains a stable-id tombstone.
 */
export function assertOpaqueCoreDeletesAllowed(
  chunks: readonly OpaqueExtensionChunk[],
  deleted: readonly Pick<CoreReference, "kind" | "id">[]
): void {
  if (!deleted.length) return;
  for (const chunk of chunks) {
    if (chunk.coreReferences === "unknown") {
      throw new Error(`Cannot delete core entities while opaque extension ${chunk.extensionId} has unknown references`);
    }
    for (const target of deleted) {
      const restricted = chunk.coreReferences.find(
        reference => reference.kind === target.kind && reference.id === target.id && reference.onDelete === "restrict"
      );
      if (restricted) {
        throw new Error(
          `Cannot delete ${target.kind} ${target.id}; opaque extension ${chunk.extensionId} restricts that reference`
        );
      }
    }
  }
}

function assertDenseColumnLengths(columns: Record<string, unknown>, count: number, name: string): void {
  for (const [field, column] of Object.entries(columns)) {
    if (!isTypedArray(column) || column.length === count) continue;
    throw new Error(`Archive ${name}.${field} has length ${column.length}; expected ${count}`);
  }
}

function assertEntityReferences(column: unknown, entityCount: number, columnName: string): void {
  if (!isTypedArray(column)) return;
  for (const entityId of column) {
    if (entityId < entityCount) continue;
    throw new Error(`Archive ${columnName} references missing entity ${entityId}`);
  }
}

function assertOptionalReference(
  record: Record<string, unknown>,
  field: string,
  entityCount: number,
  recordName: string
): void {
  const reference = record[field];
  if (reference === undefined || reference === null) return;
  if (typeof reference !== "number" || !Number.isInteger(reference) || reference < 0 || reference >= entityCount) {
    throw new Error(`Archive ${recordName}.${field} references missing entity ${String(reference)}`);
  }
}

function assertEntityTableReferences(pack: Record<string, unknown>, cellCount: number): void {
  const burgs = pack.burgs as unknown[];
  const states = pack.states as unknown[];
  const cultures = Array.isArray(pack.cultures) ? pack.cultures.length : 0;
  const provinces = Array.isArray(pack.provinces) ? pack.provinces.length : 0;

  for (const [index, state] of states.entries()) {
    if (!isRecord(state)) continue;
    assertOptionalReference(state, "center", cellCount, `pack.states[${index}]`);
    assertOptionalReference(state, "capital", burgs.length, `pack.states[${index}]`);
    if (cultures) assertOptionalReference(state, "culture", cultures, `pack.states[${index}]`);
  }
  for (const [index, burg] of burgs.entries()) {
    if (!isRecord(burg)) continue;
    assertOptionalReference(burg, "cell", cellCount, `pack.burgs[${index}]`);
    assertOptionalReference(burg, "state", states.length, `pack.burgs[${index}]`);
    if (cultures) assertOptionalReference(burg, "culture", cultures, `pack.burgs[${index}]`);
    if (provinces) assertOptionalReference(burg, "province", provinces, `pack.burgs[${index}]`);
  }
  if (!Array.isArray(pack.provinces)) return;
  for (const [index, province] of pack.provinces.entries()) {
    if (!isRecord(province)) continue;
    assertOptionalReference(province, "state", states.length, `pack.provinces[${index}]`);
    assertOptionalReference(province, "burg", burgs.length, `pack.provinces[${index}]`);
  }
}

/**
 * Validates integer id sequences. Entries equal to `allowSentinel` (default none)
 * are skipped — river cell paths use `-1` as a discontinuity marker.
 */
function assertReferenceArray(
  value: unknown,
  entityCount: number,
  fieldName: string,
  options?: { readonly allowSentinel?: number }
): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) throw new Error(`Archive ${fieldName} must be an array`);
  const allowSentinel = options?.allowSentinel;
  for (const reference of value) {
    if (allowSentinel !== undefined && reference === allowSentinel) continue;
    if (typeof reference !== "number" || !Number.isInteger(reference) || reference < 0 || reference >= entityCount) {
      throw new Error(`Archive ${fieldName} references missing entity ${String(reference)}`);
    }
  }
}

function assertNetworkReferences(pack: Record<string, unknown>, cellCount: number): void {
  const features = Array.isArray(pack.features) ? pack.features : [];
  const vertexCount = isRecord(pack.vertices) && isTypedArray(pack.vertices.i) ? pack.vertices.i.length : 0;

  if (Array.isArray(pack.features)) {
    // features[0] is often null/0 sentinel for 1-indexed ocean/land feature ids.
    assertEntityTableArray(pack.features, "pack.features");
    for (const [index, feature] of features.entries()) {
      if (!isRecord(feature)) continue;
      assertOptionalReference(feature, "firstCell", cellCount, `pack.features[${index}]`);
      assertOptionalReference(feature, "outCell", cellCount, `pack.features[${index}]`);
      if (vertexCount) assertReferenceArray(feature.vertices, vertexCount, `pack.features[${index}].vertices`);
    }
  }
  if (Array.isArray(pack.rivers)) {
    assertEntityTableArray(pack.rivers, "pack.rivers");
    for (const [index, river] of pack.rivers.entries()) {
      if (!isRecord(river)) continue;
      assertOptionalReference(river, "source", cellCount, `pack.rivers[${index}]`);
      assertOptionalReference(river, "mouth", cellCount, `pack.rivers[${index}]`);
      // River cell sequences use -1 as a path discontinuity sentinel.
      assertReferenceArray(river.cells, cellCount, `pack.rivers[${index}].cells`, { allowSentinel: -1 });
    }
  }
  if (Array.isArray(pack.routes)) {
    assertEntityTableArray(pack.routes, "pack.routes");
    for (const [index, route] of pack.routes.entries()) {
      if (!isRecord(route)) continue;
      if (features.length) assertOptionalReference(route, "feature", features.length, `pack.routes[${index}]`);
      assertReferenceArray(route.cells, cellCount, `pack.routes[${index}].cells`);
    }
  }
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
  if (typeof value.schemaVersion !== "number" || !SUPPORTED_WORLD_ARCHIVE_SCHEMA_VERSIONS.has(value.schemaVersion)) {
    throw new Error(`Unsupported archive schema ${String(value.schemaVersion)}`);
  }
  if (!Array.isArray(value.typedArrays) || !Array.isArray(value.opaqueExtensionChunks) || !isRecord(value.identity)) {
    throw new Error("Archive manifest is incomplete");
  }
  return value as unknown as ArchiveManifest;
}

/**
 * Archive v1 predates settlement-pattern persistence. This is intentionally a
 * decode-time migration so the staged document has the current shape before
 * validation or any live WorldContext mutation occurs.
 */
function migrateWorldOptions(world: unknown): void {
  if (!isRecord(world) || !isRecord(world.options)) return;
  // v1 necessarily lacks this field. Normalizing v2 too protects the typed
  // context from malformed/manual archive edits without changing valid values.
  world.options.initialSettlementPattern = normalizeInitialSettlementPattern(world.options.initialSettlementPattern);
  world.options.initialPolityRealmSize = normalizeInitialPolityRealmSize(
    world.options.initialPolityRealmSize ?? world.options.initialPolityScope
  );
  world.options.frontierStartMode = normalizeFrontierStartMode(world.options.frontierStartMode);
  delete world.options.initialPolityScope;
}

/**
 * Rename pack.cells.biome → biomeCode and ensure biomesData carries catalog keys/tags.
 * Archives saved before the biome catalog Phase 1 used the bare `biome` column and
 * parallel-array biomesData without semantic keys.
 */
function migrateBiomeCatalog(world: unknown): void {
  if (!isRecord(world)) return;
  if (isRecord(world.pack) && isRecord(world.pack.cells)) {
    const cells = world.pack.cells;
    if (cells.biomeCode === undefined && cells.biome !== undefined) {
      cells.biomeCode = cells.biome;
      delete cells.biome;
    }
    // Pre-Phase-2 archives lack habitat columns — leave undefined until generators touch them.
  }
  if (isRecord(world.biomesData)) {
    world.biomesData = ensureBiomeCatalogFields(world.biomesData as unknown as BiomesData);
  }
}

/**
 * Replaces Economy's former sparse `forestDepletion` coefficient with the
 * host-owned dense forestStock column. A pre-stock archive is interpreted as
 * fully forested except for its recorded depletion; later saves retain only
 * the one canonical timber state.
 */
function migrateForestDepletionToForestStock(document: unknown): void {
  if (!isRecord(document) || !isRecord(document.world) || !isRecord(document.simulation)) return;
  const world = document.world;
  const simulation = document.simulation;
  if (!isRecord(world.pack) || !isRecord(world.pack.cells) || !isRecord(simulation.extensions)) return;

  const economy = simulation.extensions.economy;
  if (!isRecord(economy) || economy.forestDepletion === undefined) return;

  const cells = world.pack.cells;
  const capacity = cells.forestCover;
  if (capacity instanceof Float32Array && capacity.length > 0) {
    const simulationCells: Record<string, unknown> = isRecord(simulation.cells) ? simulation.cells : {};
    if (!isRecord(simulation.cells)) simulation.cells = simulationCells;
    const stock =
      simulationCells.forestStock instanceof Float32Array ? simulationCells.forestStock : new Float32Array(capacity);
    if (!(simulationCells.forestStock instanceof Float32Array)) {
      simulationCells.forestStock = stock;
    }
    if (isRecord(economy.forestDepletion)) {
      for (const [rawCellId, rawDepletion] of Object.entries(economy.forestDepletion)) {
        const cellId = Number(rawCellId);
        if (!Number.isInteger(cellId) || cellId < 0 || cellId >= stock.length || !isFiniteNumber(rawDepletion))
          continue;
        stock[cellId] = Math.max(0, capacity[cellId] * (1 - Math.max(0, Math.min(0.9, rawDepletion))));
      }
    }
  }
  delete economy.forestDepletion;
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
    const encoded: JsonValue[] = [];
    for (const item of value) encoded.push(await encodeValue(item, context, seen));
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

function assertFiniteNonNegativeNumberRecord(value: unknown, name: string): asserts value is Record<string, number> {
  if (!isRecord(value)) throw new Error(`Archive ${name} must be a record`);
  for (const [rawId, entry] of Object.entries(value)) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 0 || String(id) !== rawId) {
      throw new Error(`Archive ${name} has invalid key ${rawId}`);
    }
    if (!isFiniteNumber(entry) || entry < 0) {
      throw new Error(`Archive ${name}.${rawId} must be a non-negative finite number`);
    }
  }
}

function assertAndNormalizePopulationLoss(simulation: Record<string, unknown>): void {
  if (simulation.populationLoss === undefined) {
    simulation.populationLoss = { simDay: 0, history: [] };
    return;
  }
  if (!isRecord(simulation.populationLoss)) {
    throw new Error("Archive simulation.populationLoss must be a record");
  }
  const populationLoss = simulation.populationLoss;
  if (!isFiniteNumber(populationLoss.simDay) || populationLoss.simDay < 0) {
    throw new Error("Archive simulation.populationLoss.simDay must be a non-negative finite number");
  }
  if (!Array.isArray(populationLoss.history)) {
    throw new Error("Archive simulation.populationLoss.history must be an array");
  }
  for (const [index, bucket] of populationLoss.history.entries()) {
    if (!isRecord(bucket)) {
      throw new Error(`Archive simulation.populationLoss.history[${index}] must be a record`);
    }
    if (!isFiniteNumber(bucket.day)) {
      throw new Error(`Archive simulation.populationLoss.history[${index}].day must be a finite number`);
    }
    if (!isRecord(bucket.byState)) {
      throw new Error(`Archive simulation.populationLoss.history[${index}].byState must be a record`);
    }
    if (!isRecord(bucket.combatByCell)) {
      throw new Error(`Archive simulation.populationLoss.history[${index}].combatByCell must be a record`);
    }
    for (const [stateId, totals] of Object.entries(bucket.byState)) {
      if (!Number.isInteger(Number(stateId)) || String(Number(stateId)) !== stateId) {
        throw new Error(`Archive simulation.populationLoss.history[${index}].byState has invalid key ${stateId}`);
      }
      if (!isRecord(totals)) {
        throw new Error(`Archive simulation.populationLoss.history[${index}].byState.${stateId} must be a record`);
      }
      for (const cause of ["combat", "famine", "natural", "other", "total"] as const) {
        if (!isFiniteNumber(totals[cause]) || (totals[cause] as number) < 0) {
          throw new Error(
            `Archive simulation.populationLoss.history[${index}].byState.${stateId}.${cause} must be non-negative`
          );
        }
      }
    }
    for (const [cellId, people] of Object.entries(bucket.combatByCell)) {
      if (!Number.isInteger(Number(cellId)) || String(Number(cellId)) !== cellId) {
        throw new Error(`Archive simulation.populationLoss.history[${index}].combatByCell has invalid key ${cellId}`);
      }
      if (!isFiniteNumber(people) || people < 0) {
        throw new Error(
          `Archive simulation.populationLoss.history[${index}].combatByCell.${cellId} must be non-negative`
        );
      }
    }
  }
}

function assertAndNormalizeNavalTechBonus(simulation: Record<string, unknown>): void {
  if (simulation.navalTechBonus === undefined) {
    simulation.navalTechBonus = {};
    return;
  }
  assertFiniteNonNegativeNumberRecord(simulation.navalTechBonus, "simulation.navalTechBonus");
}

const TECHNOLOGY_STAGES = new Set(["locked", "known", "demonstrated", "adopted", "diffused"]);
const TECHNOLOGY_SCOPES = new Set(["burg", "state", "network"]);

function assertAndNormalizeTechnology(simulation: Record<string, unknown>): void {
  if (simulation.technology === undefined) {
    simulation.technology = { lastEvaluatedYear: null, progress: [] };
    return;
  }
  if (!isRecord(simulation.technology)) {
    throw new Error("Archive simulation.technology must be a record");
  }
  const technology = simulation.technology;
  if (technology.lastEvaluatedYear !== null && !isFiniteNonNegativeInteger(technology.lastEvaluatedYear)) {
    throw new Error("Archive simulation.technology.lastEvaluatedYear must be null or a non-negative integer");
  }
  if (!Array.isArray(technology.progress)) {
    throw new Error("Archive simulation.technology.progress must be an array");
  }
  for (const [index, entry] of technology.progress.entries()) {
    if (!isRecord(entry)) {
      throw new Error(`Archive simulation.technology.progress[${index}] must be a record`);
    }
    if (typeof entry.technologyId !== "string" || entry.technologyId.length === 0) {
      throw new Error(`Archive simulation.technology.progress[${index}].technologyId must be a non-empty string`);
    }
    if (!TECHNOLOGY_SCOPES.has(entry.scope as string)) {
      throw new Error(`Archive simulation.technology.progress[${index}].scope is invalid`);
    }
    if (!Number.isInteger(entry.ownerId) || (entry.ownerId as number) < 0) {
      throw new Error(`Archive simulation.technology.progress[${index}].ownerId must be a non-negative integer`);
    }
    if (!TECHNOLOGY_STAGES.has(entry.stage as string)) {
      throw new Error(`Archive simulation.technology.progress[${index}].stage is invalid`);
    }
    if (typeof entry.diffusion !== "number" || !Number.isFinite(entry.diffusion) || entry.diffusion < 0) {
      throw new Error(`Archive simulation.technology.progress[${index}].diffusion must be a non-negative number`);
    }
  }
}

function assertAndNormalizeFrontier(simulation: Record<string, unknown>, cellCount: number): void {
  if (simulation.frontier === undefined) {
    simulation.frontier = createEmptyFrontierSimulationState(cellCount);
    return;
  }
  if (!isRecord(simulation.frontier)) throw new Error("Archive simulation.frontier must be a record");
  const frontier = simulation.frontier;
  if (!isUint8Array(frontier.cellStages) || frontier.cellStages.length !== cellCount) {
    throw new Error(`Archive simulation.frontier.cellStages must be a Uint8Array of length ${cellCount}`);
  }
  for (const stage of frontier.cellStages) {
    if (!Number.isInteger(stage) || stage < 0 || stage > 3) {
      throw new Error("Archive simulation.frontier.cellStages contains an invalid stage");
    }
  }
  if (!isRecord(frontier.projects)) throw new Error("Archive simulation.frontier.projects must be a record");
  for (const [rawCellId, project] of Object.entries(frontier.projects)) {
    const cellId = Number(rawCellId);
    if (!Number.isInteger(cellId) || cellId < 0 || cellId >= cellCount || String(cellId) !== rawCellId) {
      throw new Error(`Archive simulation.frontier.projects has invalid cell key ${rawCellId}`);
    }
    if (!isRecord(project)) throw new Error(`Archive simulation.frontier.projects.${rawCellId} must be a record`);
    if (
      project.cellId !== cellId ||
      !isPositiveInteger(project.stateId) ||
      (project.stage !== 1 && project.stage !== 2) ||
      !isFiniteNonNegativeInteger(project.establishedYear) ||
      !isFiniteNonNegativeInteger(project.supportYears) ||
      !isFiniteNonNegativeInteger(project.failedSupportYears)
    ) {
      throw new Error(`Archive simulation.frontier.projects.${rawCellId} is invalid`);
    }
    if (frontier.cellStages[cellId] !== project.stage) {
      throw new Error(`Archive simulation.frontier.projects.${rawCellId} does not match cell stage`);
    }
    if (project.lastStatus !== undefined) {
      if (
        !isRecord(project.lastStatus) ||
        !isFiniteNonNegativeInteger(project.lastStatus.year) ||
        !["maintained", "paused", "settled", "abandoned"].includes(String(project.lastStatus.outcome)) ||
        !Array.isArray(project.lastStatus.failureReasons) ||
        !project.lastStatus.failureReasons.every(reason => typeof reason === "string") ||
        !isFiniteNumber(project.lastStatus.recoveryCost) ||
        project.lastStatus.recoveryCost < 0 ||
        (project.lastStatus.disaster !== undefined &&
          !["drought", "flood", "epidemic", "bandits"].includes(String(project.lastStatus.disaster)))
      ) {
        throw new Error(`Archive simulation.frontier.projects.${rawCellId}.lastStatus is invalid`);
      }
    }
  }
  if (frontier.lastEvaluatedYear !== null && !isFiniteNonNegativeInteger(frontier.lastEvaluatedYear)) {
    throw new Error("Archive simulation.frontier.lastEvaluatedYear must be null or a non-negative integer");
  }
  assertFiniteNonNegativeNumberRecord(frontier.budgetByState, "simulation.frontier.budgetByState");
  assertFiniteNonNegativeNumberRecord(frontier.stateCooldownUntilYear, "simulation.frontier.stateCooldownUntilYear");
  if (frontier.governanceByState === undefined) frontier.governanceByState = {};
  if (!isRecord(frontier.governanceByState))
    throw new Error("Archive simulation.frontier.governanceByState must be a record");
  for (const [stateId, governance] of Object.entries(frontier.governanceByState)) {
    if (!isPositiveInteger(Number(stateId)) || String(Number(stateId)) !== stateId || !isRecord(governance)) {
      throw new Error(`Archive simulation.frontier.governanceByState.${stateId} is invalid`);
    }
    if (
      !["balanced", "expansion", "defense", "recovery"].includes(String(governance.policy)) ||
      (governance.lastEvaluatedYear !== null && !isFiniteNonNegativeInteger(governance.lastEvaluatedYear)) ||
      !isFiniteNumber(governance.reliefSpent) ||
      governance.reliefSpent < 0 ||
      !isRecord(governance.investments)
    ) {
      throw new Error(`Archive simulation.frontier.governanceByState.${stateId} is invalid`);
    }
    for (const investment of FRONTIER_INVESTMENTS) {
      if (!isFiniteNonNegativeInteger(governance.investments[investment])) {
        throw new Error(`Archive simulation.frontier.governanceByState.${stateId}.${investment} is invalid`);
      }
    }
  }
  if (frontier.applicantPoolByState === undefined) frontier.applicantPoolByState = {};
  if (!isRecord(frontier.applicantPoolByState))
    throw new Error("Archive simulation.frontier.applicantPoolByState must be a record");
  for (const [stateId, pool] of Object.entries(frontier.applicantPoolByState)) {
    if (
      !isPositiveInteger(Number(stateId)) ||
      String(Number(stateId)) !== stateId ||
      !isRecord(pool) ||
      !isFiniteNumber(pool.maleAdults) ||
      pool.maleAdults < 0 ||
      !isFiniteNumber(pool.femaleAdults) ||
      pool.femaleAdults < 0
    ) {
      throw new Error(`Archive simulation.frontier.applicantPoolByState.${stateId} is invalid`);
    }
  }
}

function assertAndNormalizeWilderness(simulation: Record<string, unknown>): void {
  if (simulation.wilderness === undefined) {
    simulation.wilderness = createEmptyWildernessEcologyState();
    return;
  }
  if (!isRecord(simulation.wilderness)) throw new Error("Archive simulation.wilderness must be a record");
  const wilderness = simulation.wilderness;
  if (wilderness.lastEvaluatedYear !== null && !isFiniteNonNegativeInteger(wilderness.lastEvaluatedYear)) {
    throw new Error("Archive simulation.wilderness.lastEvaluatedYear must be null or a non-negative integer");
  }
  if (wilderness.cullProjects === undefined) wilderness.cullProjects = {};
  if (!isRecord(wilderness.cullProjects)) {
    throw new Error("Archive simulation.wilderness.cullProjects must be a record");
  }
  for (const [rawCellId, project] of Object.entries(wilderness.cullProjects)) {
    const cellId = Number(rawCellId);
    if (!Number.isInteger(cellId) || cellId < 0 || String(cellId) !== rawCellId) {
      throw new Error(`Archive simulation.wilderness.cullProjects has invalid cell key ${rawCellId}`);
    }
    if (!isRecord(project)) throw new Error(`Archive simulation.wilderness.cullProjects.${rawCellId} must be a record`);
    if (
      !isFiniteNonNegativeInteger(project.cellId) ||
      project.cellId !== cellId ||
      !isPositiveInteger(project.stateId) ||
      !isFiniteNonNegativeInteger(project.establishedYear) ||
      !isFiniteNonNegativeInteger(project.progressYears) ||
      typeof project.dangerReduced !== "number" ||
      !Number.isFinite(project.dangerReduced) ||
      project.dangerReduced < 0
    ) {
      throw new Error(`Archive simulation.wilderness.cullProjects.${rawCellId} is invalid`);
    }
    if (project.monsterId !== null && !isFiniteNonNegativeInteger(project.monsterId)) {
      throw new Error(`Archive simulation.wilderness.cullProjects.${rawCellId}.monsterId is invalid`);
    }
    if (
      project.lastOutcome !== undefined &&
      project.lastOutcome !== "progress" &&
      project.lastOutcome !== "cleared" &&
      project.lastOutcome !== "abandoned"
    ) {
      throw new Error(`Archive simulation.wilderness.cullProjects.${rawCellId}.lastOutcome is invalid`);
    }
  }
  // pestSuppressionByCell: optional sparse 0..1 map (player-threat-cull-jobs PR-1).
  if (wilderness.pestSuppressionByCell === undefined) {
    wilderness.pestSuppressionByCell = {};
  } else if (!isRecord(wilderness.pestSuppressionByCell)) {
    throw new Error("Archive simulation.wilderness.pestSuppressionByCell must be a record");
  } else {
    const cleaned: Record<number, number> = {};
    for (const [rawCellId, rawValue] of Object.entries(wilderness.pestSuppressionByCell)) {
      const cellId = Number(rawCellId);
      if (!Number.isInteger(cellId) || cellId < 0 || String(cellId) !== rawCellId) {
        throw new Error(`Archive simulation.wilderness.pestSuppressionByCell has invalid cell key ${rawCellId}`);
      }
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        throw new Error(`Archive simulation.wilderness.pestSuppressionByCell.${rawCellId} is invalid`);
      }
      const clamped = Math.max(0, Math.min(1, rawValue));
      if (clamped > 0) cleaned[cellId] = clamped;
    }
    wilderness.pestSuppressionByCell = cleaned;
  }
}

function isUint8Array(value: unknown): value is Uint8Array {
  return isTypedArray(value) && value.constructor.name === "Uint8Array";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

/**
 * Validates the minimum runtime shape before a document is allowed to replace
 * the live compatibility backing stores. This deliberately checks the fields
 * required by the post-replace adapters as well as the archive envelope.
 */
export function assertValidWorldDocument(value: unknown): asserts value is WorldDocument {
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
  const simulation = value.simulation as Record<string, unknown>;
  const presentation = value.presentation as Record<string, unknown>;
  const pack = world.pack as Record<string, unknown> | undefined;
  if (
    typeof world.mapId !== "number" ||
    typeof world.seed !== "string" ||
    !isRecord(pack) ||
    !isRecord(world.grid) ||
    !isRecord(pack.cells) ||
    !Array.isArray(pack.burgs) ||
    !Array.isArray(pack.states) ||
    !isRecord(simulation) ||
    !isRecord(presentation.styles) ||
    !isRecord(presentation.activeLayers) ||
    !isRecord(presentation.labels)
  ) {
    const missing = [
      typeof world.mapId !== "number" ? "world.mapId" : null,
      typeof world.seed !== "string" ? "world.seed" : null,
      !isRecord(pack) ? "world.pack" : null,
      !isRecord(world.grid) ? "world.grid" : null,
      !isRecord(pack?.cells) ? "pack.cells" : null,
      !Array.isArray(pack?.burgs) ? "pack.burgs" : null,
      !Array.isArray(pack?.states) ? "pack.states" : null,
      !isRecord(simulation) ? "simulation" : null,
      !isRecord(presentation.styles) ? "presentation.styles" : null,
      !isRecord(presentation.activeLayers) ? "presentation.activeLayers" : null,
      !isRecord(presentation.labels) ? "presentation.labels" : null
    ].filter((field): field is string => field !== null);
    throw new Error(`Archive world state is incomplete: ${missing.join(", ")}`);
  }

  // layerOrder / overlays were added after the first .fmg readers. Absent fields
  // normalize to empty containers so older archives still replace cleanly.
  if (presentation.layerOrder === undefined) {
    presentation.layerOrder = [];
  } else if (
    !Array.isArray(presentation.layerOrder) ||
    !presentation.layerOrder.every(entry => typeof entry === "string")
  ) {
    throw new Error("Archive presentation.layerOrder must be a string array");
  }
  if (presentation.overlays === undefined) {
    presentation.overlays = {};
  } else if (!isRecord(presentation.overlays)) {
    throw new Error("Archive presentation.overlays must be a record");
  }

  // These values are consumed by the post-replacement simulation adapters.
  // Validate them here, before any context object is changed in-place.
  if (
    !isFiniteNumber(simulation.currentYear) ||
    !isFiniteNumber(simulation.currentMonth) ||
    !isFiniteNumber(simulation.currentDay) ||
    !isFiniteNumber(simulation.tickCount)
  ) {
    throw new Error("Archive simulation clock is incomplete");
  }
  // RNG was added after the first .fmg readers. Missing state is materialised from
  // the map seed so older archives still replace cleanly.
  if (simulation.rng === undefined) {
    const seed = typeof world.seed === "string" && world.seed.length > 0 ? world.seed : "0";
    simulation.rng = createSimulationRngState(seed);
  } else {
    assertValidSimulationRngState(simulation.rng);
  }
  // Module-local tick tallies promoted into SimulationContext (P2-8). Older archives
  // omit them; empty defaults keep overview/heatmap/naval bonus state consistent.
  assertAndNormalizePopulationLoss(simulation);
  assertAndNormalizeNavalTechBonus(simulation);
  assertAndNormalizeTechnology(simulation);
  assertAndNormalizeWilderness(simulation);
  const cells = pack.cells as Record<string, unknown>;
  if (cells.i !== undefined && !isTypedArray(cells.i)) {
    throw new Error("Archive pack.cells.i must be a typed array");
  }
  // burgs[0] is the numeric sentinel `0` in live/generated maps (1-indexed table).
  assertEntityTableArray(pack.burgs, "pack.burgs");
  assertEntityTableArray(pack.states, "pack.states");
  if (isTypedArray(cells.i)) {
    const cellCount = cells.i.length;
    assertAndNormalizeFrontier(simulation, cellCount);
    assertDenseColumnLengths(cells, cellCount, "pack.cells");
    assertEntityReferences(cells.state, pack.states.length, "pack.cells.state");
    assertEntityReferences(cells.burg, pack.burgs.length, "pack.cells.burg");
    if (Array.isArray(pack.cultures)) assertEntityReferences(cells.culture, pack.cultures.length, "pack.cells.culture");
    if (Array.isArray(pack.religions))
      assertEntityReferences(cells.religion, pack.religions.length, "pack.cells.religion");
    if (Array.isArray(pack.provinces))
      assertEntityReferences(cells.province, pack.provinces.length, "pack.cells.province");
    assertEntityTableReferences(pack, cellCount);
    assertNetworkReferences(pack, cellCount);
  }
  assertValidExtensionStateSlices(world as WorldContext, simulation as unknown as SimulationContext);
  // Registered dynamic / built-in validators run after the host-known field checks.
  assertRegisteredExtensionStateSlices(world as WorldContext, simulation as unknown as SimulationContext);
  assertOpaqueReferences(value.opaqueExtensionChunks);
}

/** ZIP codec. Typed arrays are stored as binary chunks, never decimal JSON strings. */
export class ChunkedWorldCodecAdapter implements WorldArchiveCodec {
  readonly id = "chunked-world";

  constructor(private readonly appVersion = "runtime") {}

  canDecode(header: Uint8Array): boolean {
    return header.length >= 4 && header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
  }

  async encode(document: WorldDocument): Promise<Blob> {
    assertValidWorldDocument(document);
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
    migrateWorldOptions((document as { world: unknown }).world);
    migrateBiomeCatalog((document as { world: unknown }).world);
    migrateForestDepletionToForestStock(document);
    assertValidWorldDocument(document);
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

/**
 * Core schema is currently fixed at v1. Extension lifecycle work happens here:
 * demote slices the host cannot validate, then promote opaque chunks for
 * registered extensions that successfully migrate + validate.
 */
export const worldMigrationPipeline: WorldMigrationPipeline = {
  async migrate(staged) {
    migrateForestDepletionToForestStock(staged.document);
    const demoted = await demoteUnregisteredExtensionSlices(staged.document);
    const promoted = promoteRegisteredOpaqueChunks(demoted);
    return { stage: "migrated", document: promoted };
  },
  async validate(migrated) {
    assertValidWorldDocument(migrated.document);
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
  const document = structuredClone({
    format: WORLD_ARCHIVE_FORMAT,
    schemaVersion: WORLD_ARCHIVE_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    world,
    simulation,
    presentation,
    opaqueExtensionChunks
  }) as WorldDocument;
  // `pack.cells` exposes dynamic columns only as a source-compatible adapter.
  // A snapshot stores their single canonical copy under simulation.cells.
  removeSimulationCellColumnMirrors(document.world, document.simulation);
  removeSimulationBurgStateMirrors(document.world, document.simulation);
  removeSimulationStateStateMirrors(document.world, document.simulation);
  removeSimulationMilitaryStateMirrors(document.world, document.simulation);
  removeExtensionStateSliceMirrors(document.world, document.simulation);
  return document;
}
