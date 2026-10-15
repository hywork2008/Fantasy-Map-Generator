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

import { mkdir, readdir, lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { readFmgArchive, record, type FmgArchive } from "./lib/fmgArchiveReader";

type JsonRecord = Record<string, unknown>;

type Options = {
  readonly archivePath: string;
  readonly outputDirectory: string;
  readonly burgId: number | null;
};

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

async function assertNewOrEmptyDirectory(directory: string): Promise<void> {
  try {
    const existing = await lstat(directory);
    if (existing.isSymbolicLink()) throw new Error(`Output path is a symlink: ${directory}`);
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

function indexed(value: unknown, index: number): unknown {
  return (value as ArrayLike<unknown> | undefined)?.[index];
}
function columns(values: unknown, names: readonly string[], index: number): JsonRecord {
  return Object.fromEntries(
    names.flatMap(name => {
      const value = indexed(record(values)[name], index);
      return value === undefined ? [] : [[name, value]];
    })
  );
}
async function printBurgDiagnostic(archive: FmgArchive, burgId: number): Promise<void> {
  const { world, simulation } = archive;
  if (!isRecord(world.pack)) throw new Error("Archive world data is invalid");
  const burgs = Array.isArray(world.pack.burgs) ? world.pack.burgs : [];
  const burg = burgs.find(candidate => isRecord(candidate) && candidate.i === burgId);
  if (!isRecord(burg) || typeof burg.cell !== "number") throw new Error(`Burg ${burgId} was not found in this archive`);

  const cells = isRecord(world.pack.cells) ? world.pack.cells : undefined;
  const grid = isRecord(world.grid) && isRecord(world.grid.cells) ? world.grid.cells : undefined;
  const simulationCells = isRecord(simulation.cells) ? simulation.cells : undefined;
  const extensions = isRecord(simulation.extensions) ? simulation.extensions : undefined;
  const economy = isRecord(extensions?.economy) ? extensions.economy : undefined;
  const cellId = burg.cell;
  const cell = columns(
    cells,
    ["g", "h", "area", "r", "fl", "biomeCode", "forestCover", "forestStock", "burg", "state", "culture"],
    cellId
  );
  const gridCellId = typeof cell.g === "number" ? cell.g : cellId;
  const climate = columns(grid, ["temp", "prec"], gridCellId);
  const population = columns(simulationCells, ["population", "maleAdults", "femaleAdults", "forestStock"], cellId);
  const agriculture = columns(
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

  const archive = await readFmgArchive(options.archivePath);
  await assertNewOrEmptyDirectory(options.outputDirectory);
  for (const [relativePath, payload] of archive.entries) {
    const outputPath = path.resolve(options.outputDirectory, relativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, payload);
  }
  console.log(`Extracted ${archive.entries.size} files to ${options.outputDirectory}`);
  console.log(
    `Archive: ${archive.manifest.format} schema ${archive.manifest.schemaVersion}; ${(archive.manifest.typedArrays as unknown[]).length} typed arrays`
  );
  if (options.burgId !== null) await printBurgDiagnostic(archive, options.burgId);
  return 0;
}

void main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
