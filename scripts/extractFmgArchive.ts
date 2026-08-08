#!/usr/bin/env tsx
/**
 * Extract a chunked `.fmg` archive without loading it into the application.
 *
 * Usage:
 *   npm run extract:fmg -- <map.fmg> --output <directory>
 *   npm run extract:fmg -- <map.fmg> --output <directory> --burg <burg-id>
 *
 * The archive JSON files retain `$typedArray` references. Supplying `--burg`
 * resolves the selected burg's relevant typed-array values and prints a compact
 * diagnostic summary after extraction.
 */

import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import JSZip from "jszip";

type JsonRecord = Record<string, unknown>;

type TypedArrayDescriptor = {
  readonly path: string;
  readonly type: string;
  readonly byteLength: number;
};

type ArchiveManifest = {
  readonly format: string;
  readonly schemaVersion: number;
  readonly typedArrays: readonly TypedArrayDescriptor[];
};

type Options = {
  readonly archivePath: string;
  readonly outputDirectory: string;
  readonly burgId: number | null;
};

const REQUIRED_ENTRIES = ["manifest.json", "map/world.json", "simulation/core.json", "presentation.json"];

function printUsage(): void {
  console.log(`Usage:
  npm run extract:fmg -- <map.fmg> --output <directory> [--burg <burg-id>]

Examples:
  npm run extract:fmg -- 'temp/Ordievan 2026-08-09-04-04.fmg' --output temp/ordievan-expanded
  npm run extract:fmg -- map.fmg --output temp/map-expanded --burg 56`);
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer`);
  return parsed;
}

function parseOptions(argv: readonly string[]): Options | null {
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) return null;

  const archivePath = argv[0];
  let outputDirectory: string | null = null;
  let burgId: number | null = null;

  for (let index = 1; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--output" || argument === "-o") {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a directory`);
      outputDirectory = value;
      continue;
    }
    if (argument === "--burg") {
      const value = argv[++index];
      if (!value) throw new Error("--burg requires an id");
      burgId = parsePositiveInteger(value, "--burg");
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!outputDirectory) throw new Error("--output is required to avoid writing to an implicit location");
  return { archivePath: path.resolve(archivePath), outputDirectory: path.resolve(outputDirectory), burgId };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTypedArrayReference(value: unknown): value is { readonly $typedArray: string } {
  return isRecord(value) && typeof value.$typedArray === "string";
}

function parseManifest(value: unknown): ArchiveManifest {
  if (!isRecord(value) || typeof value.format !== "string" || typeof value.schemaVersion !== "number") {
    throw new Error("manifest.json is not a valid .fmg archive manifest");
  }
  if (!Array.isArray(value.typedArrays)) throw new Error("manifest.json has no typedArrays list");

  const typedArrays = value.typedArrays.map((entry, index): TypedArrayDescriptor => {
    if (
      !isRecord(entry) ||
      typeof entry.path !== "string" ||
      typeof entry.type !== "string" ||
      typeof entry.byteLength !== "number"
    ) {
      throw new Error(`manifest.json typedArrays[${index}] is invalid`);
    }
    return { path: entry.path, type: entry.type, byteLength: entry.byteLength };
  });
  return { format: value.format, schemaVersion: value.schemaVersion, typedArrays };
}

function safeEntryPath(entryName: string): string {
  const normalized = path.posix.normalize(entryName);
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Archive contains an unsafe entry path: ${entryName}`);
  }
  return normalized;
}

async function assertNewOrEmptyDirectory(directory: string): Promise<void> {
  try {
    const existing = await stat(directory);
    if (!existing.isDirectory()) throw new Error(`Output path exists and is not a directory: ${directory}`);
    const entries = await readdir(directory);
    if (entries.length) throw new Error(`Output directory must be empty: ${directory}`);
  } catch (error: unknown) {
    if (isRecord(error) && error.code === "ENOENT") {
      await mkdir(directory, { recursive: true });
      return;
    }
    throw error;
  }
}

async function extractArchive(zip: JSZip, outputDirectory: string): Promise<number> {
  let fileCount = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const relativePath = safeEntryPath(entry.name);
    const outputPath = path.resolve(outputDirectory, relativePath);
    if (outputPath !== outputDirectory && !outputPath.startsWith(`${outputDirectory}${path.sep}`)) {
      throw new Error(`Archive entry escapes output directory: ${entry.name}`);
    }
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, await entry.async("nodebuffer"));
    fileCount++;
  }
  return fileCount;
}

function getRecordProperty(record: JsonRecord | undefined, key: string): unknown {
  return record?.[key];
}

function getIndexedValue(value: unknown, index: number): unknown {
  return Array.isArray(value) ? value[index] : undefined;
}

function typedValueAt(bytes: Uint8Array, descriptor: TypedArrayDescriptor, index: number): number | undefined {
  if (!Number.isInteger(index) || index < 0 || descriptor.byteLength !== bytes.byteLength) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = true;
  const byteOffset = (width: number): number | null => {
    const offset = index * width;
    return offset + width <= view.byteLength ? offset : null;
  };

  switch (descriptor.type) {
    case "Int8Array":
      return byteOffset(1) === null ? undefined : view.getInt8(index);
    case "Uint8Array":
    case "Uint8ClampedArray":
      return byteOffset(1) === null ? undefined : view.getUint8(index);
    case "Int16Array": {
      const offset = byteOffset(2);
      return offset === null ? undefined : view.getInt16(offset, littleEndian);
    }
    case "Uint16Array": {
      const offset = byteOffset(2);
      return offset === null ? undefined : view.getUint16(offset, littleEndian);
    }
    case "Int32Array": {
      const offset = byteOffset(4);
      return offset === null ? undefined : view.getInt32(offset, littleEndian);
    }
    case "Uint32Array": {
      const offset = byteOffset(4);
      return offset === null ? undefined : view.getUint32(offset, littleEndian);
    }
    case "Float32Array": {
      const offset = byteOffset(4);
      return offset === null ? undefined : view.getFloat32(offset, littleEndian);
    }
    case "Float64Array": {
      const offset = byteOffset(8);
      return offset === null ? undefined : view.getFloat64(offset, littleEndian);
    }
    default:
      throw new Error(`Unsupported typed array type in diagnostic output: ${descriptor.type}`);
  }
}

async function readReferencedValue(
  zip: JSZip,
  descriptors: ReadonlyMap<string, TypedArrayDescriptor>,
  reference: unknown,
  index: number
): Promise<unknown> {
  if (!isTypedArrayReference(reference)) return getIndexedValue(reference, index);
  const descriptor = descriptors.get(reference.$typedArray);
  const entry = zip.file(reference.$typedArray);
  if (!descriptor || !entry) return undefined;
  return typedValueAt(await entry.async("uint8array"), descriptor, index);
}

async function collectColumnValues(
  zip: JSZip,
  descriptors: ReadonlyMap<string, TypedArrayDescriptor>,
  columns: JsonRecord | undefined,
  names: readonly string[],
  index: number
): Promise<JsonRecord> {
  const result: JsonRecord = {};
  for (const name of names) {
    const value = await readReferencedValue(zip, descriptors, getRecordProperty(columns, name), index);
    if (value !== undefined) result[name] = value;
  }
  return result;
}

async function printBurgDiagnostic(zip: JSZip, manifest: ArchiveManifest, burgId: number): Promise<void> {
  const worldFile = zip.file("map/world.json");
  const simulationFile = zip.file("simulation/core.json");
  if (!worldFile || !simulationFile) throw new Error("Archive lacks data required for --burg");

  const world = JSON.parse(await worldFile.async("text")) as unknown;
  const simulation = JSON.parse(await simulationFile.async("text")) as unknown;
  if (!isRecord(world) || !isRecord(simulation) || !isRecord(world.pack)) throw new Error("Archive world data is invalid");

  const burgs = Array.isArray(world.pack.burgs) ? world.pack.burgs : [];
  const burg = burgs.find(candidate => isRecord(candidate) && candidate.i === burgId);
  if (!isRecord(burg) || typeof burg.cell !== "number") throw new Error(`Burg ${burgId} was not found in this archive`);

  const cells = isRecord(world.pack.cells) ? world.pack.cells : undefined;
  const grid = isRecord(world.grid) && isRecord(world.grid.cells) ? world.grid.cells : undefined;
  const simulationCells = isRecord(simulation.cells) ? simulation.cells : undefined;
  const extensions = isRecord(simulation.extensions) ? simulation.extensions : undefined;
  const economy = isRecord(extensions?.economy) ? extensions.economy : undefined;
  const descriptors = new Map(manifest.typedArrays.map(descriptor => [descriptor.path, descriptor]));
  const cellId = burg.cell;

  const cell = await collectColumnValues(
    zip,
    descriptors,
    cells,
    ["g", "h", "area", "r", "fl", "biomeCode", "forestCover", "forestStock", "burg", "state", "culture"],
    cellId
  );
  const gridCellId = typeof cell.g === "number" ? cell.g : cellId;
  const climate = await collectColumnValues(zip, descriptors, grid, ["temp", "prec"], gridCellId);
  const population = await collectColumnValues(
    zip,
    descriptors,
    simulationCells,
    ["population", "maleAdults", "femaleAdults", "forestStock"],
    cellId
  );
  const agriculture = await collectColumnValues(
    zip,
    descriptors,
    economy,
    ["foodPotential", "cultivableArea", "yieldPerArea", "ruralFoodCapacity", "cultivatedArea", "farmLaborRequired"],
    cellId
  );
  const burgStates = isRecord(simulation.burgs) ? simulation.burgs : undefined;

  console.log(
    JSON.stringify(
      {
        burg: {
          id: burgId,
          name: burg.name,
          cell: cellId,
          type: burg.type,
          group: burg.group,
          market: burg.market,
          state: burg.state,
          simulation: burgStates?.[String(burgId)]
        },
        cell,
        climate,
        population,
        agriculture
      },
      null,
      2
    )
  );
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv);
  if (!options) {
    printUsage();
    return 0;
  }

  await access(options.archivePath);
  await assertNewOrEmptyDirectory(options.outputDirectory);

  const zip = await JSZip.loadAsync(await readFile(options.archivePath));
  for (const requiredEntry of REQUIRED_ENTRIES) {
    if (!zip.file(requiredEntry)) throw new Error(`Not a chunked .fmg archive: missing ${requiredEntry}`);
  }
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("Not a chunked .fmg archive: missing manifest.json");
  const manifest = parseManifest(JSON.parse(await manifestFile.async("text")) as unknown);

  const fileCount = await extractArchive(zip, options.outputDirectory);
  console.log(`Extracted ${fileCount} files to ${options.outputDirectory}`);
  console.log(`Archive: ${manifest.format} schema ${manifest.schemaVersion}; ${manifest.typedArrays.length} typed arrays`);
  if (options.burgId !== null) await printBurgDiagnostic(zip, manifest, options.burgId);
  return 0;
}

void main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
