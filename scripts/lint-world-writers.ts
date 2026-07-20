import fs from "fs";
import path from "path";

/**
 * Transitional direct-writer inventory (P1-3 / P2-12).
 *
 * Controllers and extensions: new pack/grid writers must use a typed WorldRuntime
 * command (or reviewed allowlist entry). Generators: Phase 5 still allows in-
 * pipeline field mutation; the directory is inventoried for visibility and any
 * *direct* `worldContext.pack|grid` assignment still appears in the report so
 * new unreviewed seams cannot land silently outside the generation zone.
 */

type WriterScope = "controller" | "generator" | "extension";

interface AllowlistEntry {
  readonly reason: string;
  readonly scope: WriterScope;
}

/** Per-file allowlist for scopes that enforce strict inventoried exceptions. */
const ALLOWED_COMPATIBILITY_WRITERS = new Map<string, AllowlistEntry>([
  [
    "src/controllers/heightmapEditor.ts",
    {
      scope: "controller",
      reason: "heightmap finalize and rebuild transaction (heightmap.finalize handler)"
    }
  ],
  [
    "src/extensions/characters/charactersContext.ts",
    {
      scope: "extension",
      reason: "characters pack slice assignment through extension context helpers"
    }
  ]
]);

/**
 * Generator tree policy: internal field writes via local aliases are Phase-5
 * compatibility. Direct `worldContext.pack|grid` path assignments inside this
 * tree are counted for inventory and auto-allowed (not a new controller seam).
 */
const GENERATOR_DIRECTORY_POLICY =
  "generation pipeline (Phase 5): pack/grid mutation allowed until staged world.generate adapters own all writes";

const ROOT = path.join(import.meta.dirname, "..");

const SCAN_ROOTS: ReadonlyArray<{ readonly relativeDir: string; readonly scope: WriterScope }> = [
  { relativeDir: "src/controllers", scope: "controller" },
  { relativeDir: "src/generators", scope: "generator" },
  { relativeDir: "src/extensions", scope: "extension" }
];

/**
 * Direct write through the context root (not local aliases).
 * Covers: worldContext / this.worldContext / getWorldContext() / api.worldContext.
 */
const directWriter =
  /\b(?:delete\s+)?(?:(?:this\.)?worldContext|getWorldContext\(\)|api\.worldContext)\.(?:pack|grid)(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])+(?:\s*(?:=(?!=|>)|\+=|-=|\+\+|--)|\.(?:push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin|set)\s*\()/;

function getSourceFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return getSourceFiles(file);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.test\.tsx?$/.test(entry.name) || entry.name.endsWith(".d.ts")) return [];
    return [file];
  });
}

interface Hit {
  readonly relativePath: string;
  readonly line: number;
  readonly text: string;
  readonly scope: WriterScope;
}

const violations: string[] = [];
const inventoryByScope: Record<WriterScope, Map<string, number>> = {
  controller: new Map(),
  generator: new Map(),
  extension: new Map()
};

for (const { relativeDir, scope } of SCAN_ROOTS) {
  const absoluteDir = path.join(ROOT, relativeDir);
  for (const file of getSourceFiles(absoluteDir)) {
    const relativePath = path.relative(ROOT, file).split(path.sep).join("/");
    const lines = fs.readFileSync(file, "utf8").split("\n");
    let fileHits = 0;
    for (const [index, line] of lines.entries()) {
      if (!directWriter.test(line)) continue;
      fileHits++;

      const allow = ALLOWED_COMPATIBILITY_WRITERS.get(relativePath);
      if (allow) continue;

      if (scope === "generator") {
        // Directory policy: counted in inventory, not a failure.
        continue;
      }

      violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
    }
    if (fileHits > 0) {
      inventoryByScope[scope].set(relativePath, fileHits);
    }
  }
}

function formatInventory(scope: WriterScope): string {
  const map = inventoryByScope[scope];
  if (map.size === 0) return `  ${scope}: (none)`;
  const lines = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, count]) => {
      const allow = ALLOWED_COMPATIBILITY_WRITERS.get(file);
      const tag = allow ? `allowlisted: ${allow.reason}` : scope === "generator" ? GENERATOR_DIRECTORY_POLICY : "UNLISTED";
      return `    ${file} (${count}) — ${tag}`;
    });
  return `  ${scope} (${map.size} module${map.size === 1 ? "" : "s"}):\n${lines.join("\n")}`;
}

if (violations.length) {
  console.error(
    "Uninventoried direct world writers found. Use a WorldRuntime command or add a reviewed allowlist entry."
  );
  for (const violation of violations) console.error(`  ${violation}`);
  console.error("\nCurrent inventory:");
  console.error(formatInventory("controller"));
  console.error(formatInventory("generator"));
  console.error(formatInventory("extension"));
  process.exitCode = 1;
} else {
  const allowCount = ALLOWED_COMPATIBILITY_WRITERS.size;
  const genModules = inventoryByScope.generator.size;
  console.log(
    `World writer inventory passed (${allowCount} allowlisted module${allowCount === 1 ? "" : "s"}; generators: ${genModules} module${genModules === 1 ? "" : "s"} with direct-pattern hits under directory policy).`
  );
  console.log(formatInventory("controller"));
  console.log(formatInventory("generator"));
  console.log(formatInventory("extension"));
}
