import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import JSZip from "jszip";

export type RecordValue = Record<string, unknown>;
export function record(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !ArrayBuffer.isView(value)
    ? (value as RecordValue)
    : {};
}
export const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

export interface ArchiveLimits {
  maxBytes: number;
  maxEntries: number;
}
export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = { maxBytes: 512 * 1024 * 1024, maxEntries: 10000 };
export interface FmgArchive {
  inputPath: string;
  inputHash: string;
  manifest: RecordValue;
  world: RecordValue;
  simulation: RecordValue;
  presentation: RecordValue;
  entries: ReadonlyMap<string, Buffer>;
}

function safePath(name: string): void {
  if (
    !name ||
    name.includes("\\") ||
    name.includes("\0") ||
    /^[a-z]:/i.test(name) ||
    path.posix.isAbsolute(name) ||
    name.split("/").some(part => part === "..") ||
    path.posix.normalize(name).replace(/\/$/, "") !== name.replace(/\/$/, "")
  ) {
    throw new Error(`Unsafe archive entry path: ${name}`);
  }
}

/** No migrations or generator initialization: preserve exactly what the archive stored. */
export async function readFmgArchive(inputPath: string, limits = DEFAULT_ARCHIVE_LIMITS): Promise<FmgArchive> {
  const inputStat = await stat(inputPath);
  if (!inputStat.isFile()) throw new Error("Input must be a .fmg file");
  if (inputStat.size > limits.maxBytes) throw new Error("Compressed archive exceeds --max-archive-mb");
  const bytes = await readFile(inputPath);
  if (bytes.length > limits.maxBytes) throw new Error("Compressed archive exceeds --max-archive-mb");
  const zip = await JSZip.loadAsync(bytes);
  const files = Object.values(zip.files);
  if (files.length > limits.maxEntries) throw new Error("Archive has too many entries");
  const entries = new Map<string, Buffer>();
  let expandedBytes = 0;
  for (const file of files) {
    safePath(file.name);
    safePath(file.unsafeOriginalName ?? file.name);
    // ZIP symlinks are not meaningful map chunks and are never materialized.
    if (typeof file.unixPermissions === "number" && (file.unixPermissions & 0o170000) === 0o120000) {
      throw new Error(`Archive contains a symlink: ${file.name}`);
    }
    if (file.dir) continue;
    const payload = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = file.nodeStream("nodebuffer") as Readable;
      stream.on("data", (chunk: Buffer) => {
        expandedBytes += chunk.length;
        if (expandedBytes > limits.maxBytes) {
          const error = new Error("Expanded archive exceeds --max-archive-mb");
          reject(error);
          stream.destroy(error);
          return;
        }
        chunks.push(chunk);
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
    entries.set(file.name, payload);
  }
  function json(name: string): unknown {
    const data = entries.get(name);
    if (!data) throw new Error(`Not a supported chunked .fmg archive: missing ${name}`);
    return JSON.parse(data.toString("utf8"));
  }
  const manifest = record(json("manifest.json"));
  if (
    manifest.format !== "fantasy-map-generator" ||
    ![1, 2].includes(manifest.schemaVersion as number) ||
    manifest.endian !== "little" ||
    !Array.isArray(manifest.typedArrays)
  ) {
    throw new Error("Unsupported .fmg format, schema version, or endian");
  }
  const arrays = new Map<string, ArrayBufferView>();
  const constructors = {
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array
  };
  const nativeLittleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  for (const raw of manifest.typedArrays) {
    const d = record(raw);
    const name = String(d.path);
    safePath(name);
    if (arrays.has(name)) throw new Error(`Duplicate typed-array descriptor: ${name}`);
    const payload = entries.get(name);
    const ctor = Object.hasOwn(constructors, String(d.type)) ? constructors[d.type as keyof typeof constructors] : null;
    if (
      !ctor ||
      !payload ||
      !Number.isSafeInteger(d.byteLength) ||
      payload.length !== d.byteLength ||
      payload.length % ctor.BYTES_PER_ELEMENT !== 0
    ) {
      throw new Error(`Invalid typed-array descriptor/payload: ${name}`);
    }
    if (typeof d.checksum !== "string" || sha256(payload) !== d.checksum) {
      throw new Error(`Archive checksum mismatch: ${name}`);
    }
    const copy = Uint8Array.from(payload);
    if (!nativeLittleEndian && ctor.BYTES_PER_ELEMENT > 1) {
      for (let i = 0; i < copy.length; i += ctor.BYTES_PER_ELEMENT) {
        copy.subarray(i, i + ctor.BYTES_PER_ELEMENT).reverse();
      }
    }
    arrays.set(name, new ctor(copy.buffer));
  }
  for (const raw of Array.isArray(manifest.opaqueExtensionChunks) ? manifest.opaqueExtensionChunks : []) {
    const d = record(raw);
    const payload = entries.get(String(d.path));
    if (!payload || sha256(payload) !== d.checksum) throw new Error(`Opaque chunk checksum mismatch: ${d.path}`);
  }
  function decode(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(decode);
    if (value === null || typeof value !== "object") return value;
    const obj = record(value);
    if (Object.keys(obj).length === 1) {
      if (obj.$undefined === true) return undefined;
      if (typeof obj.$typedArray === "string") {
        const array = arrays.get(obj.$typedArray);
        if (!array) throw new Error(`Unresolved typed-array reference: ${obj.$typedArray}`);
        return array;
      }
    }
    return Object.fromEntries(Object.entries(obj).map(([key, entry]) => [key, decode(entry)]));
  }
  const world = record(decode(json("map/world.json")));
  const simulation = record(decode(json("simulation/core.json")));
  const presentation = record(decode(json("presentation.json")));
  if (
    !Array.isArray(record(world.pack).burgs) ||
    !Array.isArray(record(world.pack).routes) ||
    !Array.isArray(record(world.pack).states)
  )
    throw new Error("Archive lacks burg, route, or state tables");
  return {
    inputPath: path.resolve(inputPath),
    inputHash: sha256(bytes),
    manifest,
    world,
    simulation,
    presentation,
    entries
  };
}
