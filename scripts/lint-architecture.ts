import fs from "fs";
import path from "path";

/**
 * §12.4 / P3-3 architecture lint.
 *
 * Enforced continuously via `npm run lint:architecture` (wired into lint:legacy):
 * 1. Generator tree must not import Renderer modules (allowlisted residual seams).
 * 2. Extension generator trees must not import host or local Renderer modules
 *    (tick / simulation systems stay pure; UI draw lives in index/controllers).
 * 3. Type-only imports (`import type` / `export type`) are always allowed.
 */

const ROOT = path.join(import.meta.dirname, "..");

/** Reviewed residual Generator → Renderer seams. New hits must not be added here lightly. */
const ALLOWED_GENERATOR_RENDERER_IMPORTS = new Map<string, ReadonlySet<string>>([
  [
    "src/generators/burgs-generator.ts",
    new Set([
      // Burg remove still clears SVG icon/label immediately; burg.remove command path is partial.
      "../renderers",
      // COA cache registration during interactive burg create (generation pipeline side effect).
      "../renderers/emblem-renderer"
    ])
  ],
  [
    "src/generators/resample.ts",
    // Ocean layer SVG rebuild after resample regraph — view work still inside generator.
    new Set(["../renderers/ocean-layers"])
  ]
]);

const IMPORT_RE =
  /^\s*(?:export\s+)?import\s+(type\s+)?(?:[\s\S]*?\s+from\s+|)\s*["']([^"']+)["']\s*;?\s*$/;

const MULTI_LINE_IMPORT_START = /^\s*(?:export\s+)?import\s+(type\s+)?/;

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

function collectImportSpecifiers(source: string): Array<{ line: number; typeOnly: boolean; specifier: string }> {
  const lines = source.split("\n");
  const results: Array<{ line: number; typeOnly: boolean; specifier: string }> = [];
  let pending: { startLine: number; typeOnly: boolean; buffer: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    if (pending) {
      pending.buffer += ` ${trimmed}`;
      if (trimmed.includes(";")) {
        const match = pending.buffer.match(/from\s+["']([^"']+)["']/);
        if (match) {
          results.push({ line: pending.startLine, typeOnly: pending.typeOnly, specifier: match[1] });
        }
        pending = null;
      }
      continue;
    }

    const single = line.match(IMPORT_RE);
    if (single) {
      results.push({ line: i + 1, typeOnly: Boolean(single[1]), specifier: single[2] });
      continue;
    }

    const start = line.match(MULTI_LINE_IMPORT_START);
    if (start && !line.includes(";") && (line.includes("{") || line.includes("from"))) {
      pending = { startLine: i + 1, typeOnly: Boolean(start[1]), buffer: trimmed };
    }
  }

  return results;
}

/** True when the import resolves into a Renderer module (host or extension-local). */
function isRendererImport(specifier: string, fromFile: string): boolean {
  if (specifier.includes("/renderers/") || specifier.endsWith("/renderers") || /\/renderers$/.test(specifier)) {
    return true;
  }
  // Bare `../renderers` barrel and `./renderers/foo` under extension packages.
  if (/(^|[/"'])renderers([/"']|$)/.test(specifier)) {
    // Avoid matching paths like `.../unrelated/renderersome` — require segment boundary.
    const segments = specifier.split("/");
    if (segments.includes("renderers")) return true;
  }

  // Absolute-from-src style (rare): `src/renderers/...`
  if (specifier.startsWith("src/renderers/") || specifier === "src/renderers") return true;

  // Resolve relative imports that land under src/renderers/
  if (specifier.startsWith(".")) {
    const resolved = path.normalize(path.join(path.dirname(fromFile), specifier)).split(path.sep).join("/");
    if (resolved.includes("/src/renderers/") || resolved.endsWith("/src/renderers")) return true;
  }

  return false;
}

function relativePosix(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

const violations: string[] = [];
let residualAllowed = 0;

// ── 1. Host generators ───────────────────────────────────────────────────────
for (const file of getSourceFiles(path.join(ROOT, "src/generators"))) {
  const relativePath = relativePosix(file);
  const source = fs.readFileSync(file, "utf8");
  const allowed = ALLOWED_GENERATOR_RENDERER_IMPORTS.get(relativePath);

  for (const imp of collectImportSpecifiers(source)) {
    if (imp.typeOnly) continue;
    if (!isRendererImport(imp.specifier, file)) continue;

    if (allowed?.has(imp.specifier)) {
      residualAllowed++;
      continue;
    }

    violations.push(
      `${relativePath}:${imp.line}: Generator must not import Renderer module "${imp.specifier}" (plan §12.4 / P3-3)`
    );
  }
}

// ── 2. Extension generators (simulation data owners) ─────────────────────────
for (const file of getSourceFiles(path.join(ROOT, "src/extensions"))) {
  const relativePath = relativePosix(file);
  // Only generator trees: UI index/controllers may still own draw hooks.
  if (!relativePath.includes("/generators/")) continue;

  const source = fs.readFileSync(file, "utf8");
  for (const imp of collectImportSpecifiers(source)) {
    if (imp.typeOnly) continue;
    if (!isRendererImport(imp.specifier, file)) continue;
    violations.push(
      `${relativePath}:${imp.line}: Extension generator must not import Renderer module "${imp.specifier}" (plan §12.4 / P3-3)`
    );
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log("Architecture lint (Generator → Renderer boundary, P3-3)...");
if (residualAllowed > 0) {
  console.log(`  residual allowlisted generator→renderer imports: ${residualAllowed}`);
  for (const [file, specs] of ALLOWED_GENERATOR_RENDERER_IMPORTS) {
    console.log(`    ${file}: ${[...specs].join(", ")}`);
  }
}

if (violations.length) {
  console.error(`\n${violations.length} architecture violation(s):`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log("  Generator → Renderer: clean (allowlist only).");
console.log("  Extension generators → Renderer: clean.");
console.log("Done.");
