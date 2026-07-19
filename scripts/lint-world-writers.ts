import fs from "fs";
import path from "path";

/**
 * Transitional direct-writer inventory. New editor writers must use a typed
 * WorldRuntime command; only the listed compatibility flows may mutate the
 * legacy pack/grid backing store directly while their larger transactions are
 * being migrated.
 */
const ALLOWED_COMPATIBILITY_WRITERS = new Map<string, string>([
  ["src/controllers/biomes-editor.ts", "compatibility mutation published as map.physical"],
  ["src/controllers/burg-editor.ts", "compatibility mutations published by the burg editor"],
  ["src/controllers/diplomacy-editor.ts", "diplomacy bulk-edit transaction"],
  ["src/controllers/heightmapBrushes.ts", "in-progress heightmap preview"],
  ["src/controllers/heightmapEditor.ts", "heightmap rebuild transaction publishes on finalize"],
  ["src/controllers/heightmapImage.ts", "in-progress heightmap image import"],
  ["src/controllers/heightmapTemplate.ts", "in-progress heightmap template application"],
  ["src/controllers/provinces-editor.ts", "province regeneration compatibility flow"],
  ["src/controllers/religions-editor.ts", "religion editor fields awaiting command migration"],
  ["src/controllers/rivers-creator.ts", "river creator preview and finalization"],
  ["src/controllers/tools.ts", "multi-entity tool transactions awaiting command migration"],
  ["src/controllers/world-configurator.ts", "world-wide configuration regeneration"]
]);

const controllersDirectory = path.join(import.meta.dirname, "../src/controllers");
const directWriter = /\bworldContext\.(?:pack|grid)(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])+\s*(?:=(?!=|>)|\+=|-=|\+\+|--)/;

function getSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return getSourceFiles(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

const violations: string[] = [];
for (const file of getSourceFiles(controllersDirectory)) {
  const relativePath = path.relative(path.join(import.meta.dirname, ".."), file);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (const [index, line] of lines.entries()) {
    if (!directWriter.test(line)) continue;
    if (!ALLOWED_COMPATIBILITY_WRITERS.has(relativePath)) {
      violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
    }
  }
}

if (violations.length) {
  console.error("Uninventoried direct world writers found. Use a WorldRuntime command or add a reviewed allowlist entry.");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`World writer inventory passed (${ALLOWED_COMPATIBILITY_WRITERS.size} compatibility modules).`);
}
