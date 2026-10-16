import fs from "node:fs";
import path from "node:path";
import { build, type Metafile } from "esbuild";

/**
 * Simulation core boundary lint (docs/plan/simulation-core-separation.md §4.2).
 *
 * The simulation core is everything statically or dynamically imported from the core entries
 * below. It must not reach DOM / rendering / React / three / UI-store modules, nor touch browser
 * globals at runtime. Existing violations are recorded in scripts/sim-boundary-allowlist.json and
 * may only shrink:
 *
 *   npm run lint:sim-boundary                      # fail on any new violation or stale entry
 *   npm run lint:sim-boundary -- --update          # rewrite the allowlist after removing violations
 *   npm run lint:sim-boundary -- --update --accept-new   # also record new ones (needs a reason in review)
 *   npm run lint:sim-boundary -- --why src/renderers/index.ts   # print the import chain
 */

const ROOT = path.join(import.meta.dirname, "..");
const ALLOWLIST_PATH = path.join(ROOT, "scripts/sim-boundary-allowlist.json");

/** Extensions without a `simulation.ts` entry yet (S5) contribute these files as entries. */
const PROVISIONAL_EXTENSION_ENTRIES: Record<string, (file: string) => boolean> = {
  economy: file => file.startsWith("src/extensions/economy/generators/"),
  nobility: file => file.startsWith("src/extensions/nobility/generators/"),
  shipbuilding: file => file.startsWith("src/extensions/shipbuilding/generators/"),
  characters: file => /^src\/extensions\/characters\/[^/]+\.ts$/.test(file) && !file.endsWith("/index.ts")
};

const FORBIDDEN_MODULES: ReadonlyArray<{ readonly reason: string; readonly test: (file: string) => boolean }> = [
  { reason: "React component module", test: file => file.endsWith(".tsx") },
  {
    reason: "view / UI layer",
    test: file =>
      /^src\/(renderers|canvas|ui|controllers|dom|io|store|i18n|region-editor|city-editor|dungeon-editor|encyclopedia)\//.test(
        file
      ) || /^src\/(main|app|initViewLayers|actions)\.ts$/.test(file)
  },
  { reason: "extension view / UI layer", test: file => /^src\/extensions\/[^/]+\/(ui|controllers|renderers|store)\//.test(file) },
  {
    reason: "view service",
    test: file =>
      [
        "src/context/viewContext.ts",
        "src/services/tooltipService.ts",
        "src/services/viewLayerService.ts",
        "src/services/mapViewport.ts",
        "src/services/mapInteraction.ts",
        "src/utils/domUtils.ts",
        "src/utils/editorHelpers.ts"
      ].includes(file)
  }
];

const FORBIDDEN_PACKAGES = /^(three|react|react-dom|@react-|deck\.gl|@deck\.gl|@loaders\.gl|maplibre)/;

/** Browser globals the core must receive through ports instead (§6). */
const RUNTIME_PATTERNS: Record<string, RegExp> = {
  document: /\bdocument\./g,
  window: /\bwindow\./g,
  localStorage: /\b(localStorage|sessionStorage)\b/g,
  requestAnimationFrame: /\b(requestAnimationFrame|cancelAnimationFrame)\b/g,
  navigator: /\bnavigator\./g
};

interface Allowlist {
  modules: Record<string, string>;
  packages: Record<string, string>;
  runtime: Record<string, Record<string, number>>;
}

function listSourceFiles(directory: string): string[] {
  return fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(relative);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name) || entry.name.endsWith(".d.ts")) return [];
    return [relative];
  });
}

function coreEntries(): string[] {
  const entries = ["src/simulation/core.ts"];
  const extensionFiles = listSourceFiles("src/extensions");
  for (const [id, provisional] of Object.entries(PROVISIONAL_EXTENSION_ENTRIES)) {
    const simulationEntry = `src/extensions/${id}/simulation.ts`;
    if (fs.existsSync(path.join(ROOT, simulationEntry))) entries.push(simulationEntry);
    else entries.push(...extensionFiles.filter(provisional));
  }
  return entries;
}

async function buildGraph(entries: string[]): Promise<Metafile> {
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: entries,
    bundle: true,
    write: false,
    metafile: true,
    outdir: path.join(ROOT, "temp/sim-boundary"),
    splitting: true,
    format: "esm",
    platform: "neutral",
    packages: "external",
    logLevel: "silent",
    loader: { ".csv": "text", ".svg": "text", ".md": "text", ".html": "text", ".png": "empty", ".css": "empty" }
  });
  return result.metafile;
}

/** BFS parents from every entry, so a violation can print its shortest import chain. */
function reachability(metafile: Metafile, entries: string[]) {
  const parent = new Map<string, { from: string | null; dynamic: boolean }>();
  const queue = [...entries];
  for (const entry of entries) parent.set(entry, { from: null, dynamic: false });
  const packages = new Map<string, string>();
  while (queue.length) {
    const file = queue.shift() as string;
    for (const imported of metafile.inputs[file]?.imports ?? []) {
      const dynamic = imported.kind === "dynamic-import";
      if (imported.external) {
        if (!packages.has(imported.path)) packages.set(imported.path, file);
        continue;
      }
      if (parent.has(imported.path)) continue;
      parent.set(imported.path, { from: file, dynamic });
      queue.push(imported.path);
    }
  }
  const chain = (file: string) => {
    const steps: string[] = [];
    for (let current: string | null = file; current; current = parent.get(current)?.from ?? null)
      steps.unshift(parent.get(current)?.dynamic ? `${current} (dynamic)` : current);
    return steps.join(" -> ");
  };
  return { reached: [...parent.keys()], packages, chain };
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function collectRuntimeUses(files: string[]): Record<string, Record<string, number>> {
  const runtime: Record<string, Record<string, number>> = {};
  for (const file of files) {
    if (!/\.tsx?$/.test(file)) continue;
    const source = stripComments(fs.readFileSync(path.join(ROOT, file), "utf8"));
    for (const [name, pattern] of Object.entries(RUNTIME_PATTERNS)) {
      const count = source.match(pattern)?.length ?? 0;
      if (count) (runtime[file] ??= {})[name] = count;
    }
  }
  return runtime;
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const args = process.argv.slice(2);
  const update = args.includes("--update");
  const acceptNew = args.includes("--accept-new");
  const whyIndex = args.indexOf("--why");

  const entries = coreEntries();
  const metafile = await buildGraph(entries);
  const { reached, packages, chain } = reachability(metafile, entries);
  const sourceFiles = reached.filter(file => file.startsWith("src/"));

  if (whyIndex >= 0) {
    const target = args[whyIndex + 1];
    const hit = sourceFiles.find(file => file === target || file.startsWith(target));
    console.log(hit ? chain(hit) : `${target} is not reachable from the simulation core`);
    return;
  }

  const current: Allowlist = { modules: {}, packages: {}, runtime: {} };
  for (const file of sourceFiles) {
    const rule = FORBIDDEN_MODULES.find(candidate => candidate.test(file));
    if (rule) current.modules[file] = `${rule.reason}: ${chain(file)}`;
  }
  for (const [name, importer] of packages)
    if (FORBIDDEN_PACKAGES.test(name)) current.packages[name] = chain(importer);
  // Forbidden modules are violations already; only count runtime globals in would-be core files.
  current.runtime = collectRuntimeUses(sourceFiles.filter(file => !(file in current.modules)));

  const allowlist: Allowlist = fs.existsSync(ALLOWLIST_PATH)
    ? JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"))
    : { modules: {}, packages: {}, runtime: {} };

  const added: string[] = [];
  const stale: string[] = [];
  for (const file of Object.keys(current.modules))
    if (!(file in allowlist.modules)) added.push(`module ${current.modules[file]}`);
  for (const file of Object.keys(allowlist.modules)) if (!(file in current.modules)) stale.push(`module ${file}`);
  for (const name of Object.keys(current.packages))
    if (!(name in allowlist.packages)) added.push(`package ${name}: ${current.packages[name]}`);
  for (const name of Object.keys(allowlist.packages)) if (!(name in current.packages)) stale.push(`package ${name}`);
  const runtimeFiles = new Set([...Object.keys(current.runtime), ...Object.keys(allowlist.runtime)]);
  for (const file of runtimeFiles) {
    const now = current.runtime[file] ?? {};
    const allowed = allowlist.runtime[file] ?? {};
    for (const name of new Set([...Object.keys(now), ...Object.keys(allowed)])) {
      const nowCount = now[name] ?? 0;
      const allowedCount = allowed[name] ?? 0;
      if (nowCount > allowedCount) added.push(`runtime ${file}: ${name} ${allowedCount} -> ${nowCount}`);
      else if (nowCount < allowedCount) stale.push(`runtime ${file}: ${name} ${allowedCount} -> ${nowCount}`);
    }
  }

  const summary =
    `${sourceFiles.length} core modules from ${entries.length} entries; ` +
    `${Object.keys(current.modules).length} forbidden modules, ${Object.keys(current.packages).length} forbidden packages, ` +
    `${Object.values(current.runtime).reduce((sum, uses) => sum + Object.values(uses).reduce((a, b) => a + b, 0), 0)} browser-global uses in ${Object.keys(current.runtime).length} files`;

  if (update) {
    if (added.length && !acceptNew) {
      console.error(`Refusing to grow the allowlist (pass --accept-new to record these):\n  ${added.join("\n  ")}`);
      process.exit(1);
    }
    const next: Allowlist = {
      modules: sortRecord(current.modules),
      packages: sortRecord(current.packages),
      runtime: sortRecord(Object.fromEntries(Object.entries(current.runtime).map(([file, uses]) => [file, sortRecord(uses)])))
    };
    fs.writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`lint:sim-boundary allowlist updated (${added.length} added, ${stale.length} removed). ${summary}`);
    return;
  }

  if (added.length) console.error(`New simulation-core boundary violations:\n  ${added.join("\n  ")}`);
  if (stale.length)
    console.error(`Allowlist entries no longer needed (run with --update to shrink it):\n  ${stale.join("\n  ")}`);
  if (added.length || stale.length) process.exit(1);
  console.log(`lint:sim-boundary passed. ${summary}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
