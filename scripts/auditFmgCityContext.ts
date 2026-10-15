#!/usr/bin/env tsx
import { parseCeRoadReference } from "./lib/fmgCityAudit/ceRoads";
/** Read-only saved-map facts and Directions export. See docs/tools/fmg-city-audit.md. */
import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DEFAULT_ARCHIVE_LIMITS, readFmgArchive, sha256 } from "./lib/fmgArchiveReader";
import { type AuditOptions, buildCityAudit } from "./lib/fmgCityAudit/model";
import { CSV_COLUMNS, csvString, jsonString, summaryMarkdown } from "./lib/fmgCityAudit/output";

type Options = AuditOptions & {
  input: string;
  output: string;
  format: string;
  expand: boolean;
  failOn: string;
  maxArchiveMb: number;
  ceHandoffPath?: string;
};
const usage = `Usage:
  npm run audit:fmg-cities -- <map.fmg> --output <new-or-empty-directory> (--burg <id> | --all) [options]

Options:
  --burg <id>                 Origin burg ID (repeatable)
  --all                       Every live burg as an origin
  --format json|csv|both       Default: both
  --distance-unit km|mi|lg|vr|nmi  Physical units when absent in save
  --travel-mode auto|foot|mounted|wagon  Default: auto (same selection as Directions)
  --avoid-sea | --prefer-sea   Same search options as Directions
  --height-exponent <1..5>     Default: stored value or shared default 1.8
  --nearby-radius-km <number>  Also export geographic neighbors
  --ce-handoff <json>          Compare actual CE road handoff captured from the same input
  --expand                    Preserve archive chunks under raw/
  --fail-on error|warning|never  Default: error; exit 2 for matching findings
  --max-archive-mb <number>    Compressed/expanded byte limit (default: 512)
  --help                      Show help

Exit: 0 success; 1 input/output failure; 2 report written with findings matching --fail-on.
CE road projection is read-only; unavailable preparation and historical rules are marked skipped.`;

export function parseAuditOptions(argv: string[]): Options | null {
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) return null;
  const options: Options = {
    input: path.resolve(argv[0]),
    output: "",
    burgIds: [],
    all: false,
    format: "both",
    expand: false,
    failOn: "error",
    maxArchiveMb: 512,
    travelMode: "auto",
    avoidSea: false,
    preferSea: false
  };
  const positive = (value: string, flag: string) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${flag} requires a positive finite number`);
    return n;
  };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") {
      options.all = true;
      continue;
    }
    if (arg === "--expand") {
      options.expand = true;
      continue;
    }
    if (arg === "--avoid-sea") {
      options.avoidSea = true;
      continue;
    }
    if (arg === "--prefer-sea") {
      options.preferSea = true;
      continue;
    }
    if (
      ![
        "--output",
        "-o",
        "--burg",
        "--format",
        "--distance-unit",
        "--travel-mode",
        "--height-exponent",
        "--nearby-radius-km",
        "--fail-on",
        "--max-archive-mb",
        "--ce-handoff"
      ].includes(arg)
    )
      throw new Error(`Unknown argument: ${arg}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    switch (arg) {
      case "--ce-handoff":
        options.ceHandoffPath = path.resolve(value);
        break;
      case "--output":
      case "-o":
        options.output = path.resolve(value);
        break;
      case "--burg": {
        const n = positive(value, arg);
        if (!Number.isSafeInteger(n)) throw new Error("--burg requires an integer");
        options.burgIds.push(n);
        break;
      }
      case "--format":
        if (!["json", "csv", "both"].includes(value)) throw new Error("Invalid --format");
        options.format = value;
        break;
      case "--distance-unit":
        if (!["km", "mi", "lg", "vr", "nmi"].includes(value)) throw new Error("Unknown --distance-unit");
        options.distanceUnit = value;
        break;
      case "--travel-mode":
        if (!["auto", "foot", "mounted", "wagon"].includes(value)) throw new Error("Invalid --travel-mode");
        options.travelMode = value as Options["travelMode"];
        break;
      case "--height-exponent": {
        const n = positive(value, arg);
        if (n < 1 || n > 5) throw new Error("--height-exponent must be 1..5");
        options.heightExponent = n;
        break;
      }
      case "--nearby-radius-km":
        options.nearbyRadiusKm = positive(value, arg);
        break;
      case "--max-archive-mb":
        options.maxArchiveMb = positive(value, arg);
        break;
      case "--fail-on":
        if (!["error", "warning", "never"].includes(value)) throw new Error("Invalid --fail-on");
        options.failOn = value;
        break;
    }
  }
  if (!options.output) throw new Error("--output is required");
  if (options.all === options.burgIds.length > 0) throw new Error("Specify either --all or at least one --burg");
  if (options.avoidSea && options.preferSea) throw new Error("--avoid-sea and --prefer-sea cannot be combined");
  return options;
}

async function assertSafeOutput(directory: string): Promise<void> {
  try {
    const stat = await lstat(directory);
    if (stat.isSymbolicLink()) throw new Error(`Output path is a symlink: ${directory}`);
    if (!stat.isDirectory() || (await readdir(directory)).length)
      throw new Error("Output must be a new or empty directory");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Resolve existing ancestors once, including macOS /var -> /private/var. */
async function canonicalOutput(directory: string): Promise<string> {
  await assertSafeOutput(directory);
  const suffix: string[] = [];
  let current = path.resolve(directory);
  while (true) {
    try {
      return path.join(await realpath(current), ...suffix);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      suffix.unshift(path.basename(current));
      current = path.dirname(current);
    }
  }
}

export async function runAudit(options: Options): Promise<number> {
  if (options.input === options.output) throw new Error("Input and output must differ");
  const outputPath = await canonicalOutput(options.output);
  const archive = await readFmgArchive(options.input, {
    ...DEFAULT_ARCHIVE_LIMITS,
    maxBytes: options.maxArchiveMb * 1024 * 1024
  });
  let handoff: ReturnType<typeof parseCeRoadReference> | undefined;
  let handoffHash: string | null = null;
  if (options.ceHandoffPath) {
    const bytes = await readFile(options.ceHandoffPath);
    if (bytes.length > 64 * 1024 * 1024) throw new Error("CE handoff reference exceeds 64 MiB");
    handoffHash = sha256(bytes);
    handoff = parseCeRoadReference(JSON.parse(bytes.toString("utf8")));
  }
  const report = buildCityAudit(archive, { ...options, ceHandoff: handoff });
  let revision: string | null = null;
  let dirty: boolean | null = null;
  try {
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    dirty = !!execFileSync("git", ["status", "--porcelain"], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    /* An exported source directory may not have .git. */
  }
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputPath: archive.inputPath,
    inputSha256: archive.inputHash,
    ceHandoffSha256: handoffHash,
    archiveManifest: archive.manifest,
    codeRevision: revision,
    workingTreeDirty: dirty,
    options,
    measurement: report.metadata,
    rulesVersion: 1,
    historicalRulesEnabled: false
  };
  report.metadata = {
    ...report.metadata,
    inputSha256: archive.inputHash,
    ceHandoffSha256: handoffHash,
    codeRevision: revision,
    workingTreeDirty: dirty
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await assertSafeOutput(outputPath);
  const staging = await mkdtemp(path.join(path.dirname(outputPath), ".fmg-audit-"));
  try {
    await writeFile(path.join(staging, "manifest.json"), jsonString(manifest));
    if (options.format !== "csv") await writeFile(path.join(staging, "report.json"), jsonString(report));
    if (options.format !== "json") {
      for (const [name, columns] of Object.entries(CSV_COLUMNS)) {
        if (name === "nearby" && options.nearbyRadiusKm === undefined) continue;
        const rows = report[name as keyof typeof CSV_COLUMNS];
        await writeFile(path.join(staging, `${name}.csv`), csvString(rows, columns));
      }
    }
    await writeFile(path.join(staging, "summary.md"), summaryMarkdown(report));
    if (options.expand) {
      for (const [name, bytes] of archive.entries) {
        const target = path.join(staging, "raw", name);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, bytes, { flag: "wx" });
      }
    }
    if (sha256(await readFile(options.input)) !== archive.inputHash)
      throw new Error("Input changed during audit; output discarded");
    if (options.ceHandoffPath && sha256(await readFile(options.ceHandoffPath)) !== handoffHash)
      throw new Error("CE handoff reference changed during audit; output discarded");
    await assertSafeOutput(outputPath);
    await rename(staging, outputPath);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  const flagged = report.findings.filter(f => f.status === "flagged");
  const errors = flagged.filter(f => f.severity === "error").length;
  const warnings = flagged.filter(f => f.severity === "warning").length;
  console.log(
    `Wrote ${report.burgs.length} cities, ${report.connections.length} connections, ${report.directions.length} Directions results to ${options.output}`
  );
  console.log(`Findings: ${errors} errors, ${warnings} warnings; unavailable audits are marked skipped.`);
  return options.failOn !== "never" && (errors > 0 || (options.failOn === "warning" && warnings > 0)) ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void (async () => {
    const options = parseAuditOptions(process.argv.slice(2));
    if (!options) {
      console.log(usage);
      return;
    }
    process.exitCode = await runAudit(options);
  })().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
