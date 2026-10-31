import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const codex = "Codex GPT-6.1 Sol";
type Row = { category: string; id: string; name: string; source: string; highAuthors: string[]; evidence: string };
const rows: Row[] = [];
const add = (row: Row) => rows.push(row);
const load = async (file: string) => import(pathToFileURL(path.join(root, file)).href);

for (const name of (await readdir("src/buildings/medieval")).filter(name => name.endsWith("Models.ts")).sort()) {
  const source = `src/buildings/medieval/${name}`;
  for (const model of (await load(source)).models) {
    if (model.task === 43) continue;
    const highs = model.variants?.filter((v: { level: string }) => ["high", "ultra"].includes(v.level));
    const highAuthors: string[] = highs?.map((v: { author: string }) => v.author) ?? [];
    if (model.quality === "high") highAuthors.push(model.author ?? codex);
    add({ category: `Medieval ${String(model.task).padStart(2, "0")}`, id: model.id, name: model.name, source,
      highAuthors: [...new Set(highAuthors)], evidence: highs?.length ? "variants: high/ultra" : model.quality === "high" ? "quality: high; detailed factory" : "single/default; assumed Low" });
  }
}
for (const name of (await readdir("src/buildings/landmarks")).filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts")).sort()) {
  const source = `src/buildings/landmarks/${name}`;
  if (["architectureKit.ts", "landmarkTestSupport.ts"].includes(name)) continue;
  const model = (await load(source)).model;
  if (!model) throw new Error(`Missing landmark export: ${source}`);
  const highAuthors: string[] = [model.highDetail, model.ultraDetail].filter(Boolean).map(v => v.author ?? model.author ?? codex);
  add({ category: `${model.style} landmark`, id: model.id, name: model.name, source, highAuthors: [...new Set(highAuthors)],
    evidence: highAuthors.length ? "highDetail/ultraDetail" : "base only; documented low-resolution" });
}
for (const name of (await readdir("src/buildings/catalogue")).filter(name => name.endsWith(".json")).sort()) {
  const source = `src/buildings/catalogue/${name}`;
  const record = JSON.parse(await readFile(source, "utf8"));
  add({ category: "Catalogue", id: record.id, name: record.name, source, highAuthors: [], evidence: "catalogueMassing; Low" });
}

// Discover the named model definitions actually imported by BV, rather than CE-only models.
const viewer = ts.createSourceFile("main.ts", await readFile("src/building-viewer/main.ts", "utf8"), ts.ScriptTarget.Latest, true);
const seen = new Set<string>();
for (const statement of viewer.statements) {
  if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
  const relative = statement.moduleSpecifier.text;
  if (!relative.startsWith("../buildings/")) continue;
  const clause = statement.importClause;
  if (!clause || clause.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
  const symbols = clause.namedBindings.elements.filter(el => !el.isTypeOnly).map(el => (el.propertyName ?? el.name).text);
  if (!symbols.length) continue;
  const source = path.normalize(path.join("src/building-viewer", `${relative}.ts`));
  const module = await load(source);
  for (const symbol of symbols) {
    if (!/^[A-Z][A-Z_]+$/.test(symbol)) continue;
    const value = module[symbol];
    if (!value || typeof value !== "object") continue;
    if (symbol === "REGIONAL_HOUSES") {
      for (const profile of ["mediterranean", "atlantic", "northern-wooded", "northern-urban", "stone-upland"])
        add({ category: "Regional house", id: `regional-${profile}`, name: profile, source, highAuthors: [value.author], evidence: "explicit high/low factory; Opus only" });
      continue;
    }
    const houseName = symbol === "EARTHEN_HOUSES" ? "Earthen flat-roof houses" : symbol === "POLYGON_HOUSES" ? "Polygonal and narrow houses" : undefined;
    const definitions: [string, { id?: string; name?: string; author?: string }][] = "name" in value || houseName ? [[symbol, value]] : Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
    for (const [entryKey, definition] of definitions) {
      if (!definition || typeof definition !== "object") continue;
      const label = definition.name ?? houseName ?? (symbol === "HANGING_SIGN_TEMPLATES" ? definition.id : undefined);
      if (!label) continue;
      const id = definition.id ?? `${symbol.toLowerCase().replaceAll("_", "-")}${entryKey === symbol ? "" : `-${entryKey}`}`;
      const key = `${source}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isBasilica = symbol === "BASILICA_TEMPLE";
      const isHouse = ["EARTHEN_HOUSES", "POLYGON_HOUSES"].includes(symbol);
      const isOpusGalleon = symbol === "OPUS_GALLEON";
      const highAuthors = isBasilica || isHouse || isOpusGalleon ? [definition.author ?? codex] : [];
      const states = symbol === "MEDIEVAL_CONTAINERS" ? ["empty", "closed", "loaded"] : [""];
      for (const state of states)
        add({ category: "Direct BV study", id: state ? `${id}-${state}` : id, name: `${label}${state ? ` · ${state}` : ""}`, source,
          highAuthors, evidence: highAuthors.length ? "explicit high/low factory" : "single/default; assumed Low" });
    }
  }
}
const missing = rows.filter(row => !row.highAuthors.includes(codex));
const completed = rows.filter(row => row.highAuthors.includes(codex));
const table = (list: Row[]) => [
  "| Category | ID | Model | Quality evidence |", "| --- | --- | --- | --- |",
  ...list.map(row => `| ${row.category} | \`${row.id}\` | ${row.name.replaceAll("|", "/")} | ${row.evidence}${row.highAuthors.length ? `; ${row.highAuthors.join(", ")}` : ""} - [source](../../${row.source}) |`)
].join("\n");
const summary = [...new Set(rows.map(row => row.category))].sort().map(category => {
  const all = rows.filter(row => row.category === category);
  return `| ${category} | ${all.length} | ${all.filter(row => row.highAuthors.includes(codex)).length} | ${all.filter(row => !row.highAuthors.includes(codex)).length} |`;
});
const report = `# BV non-tree Codex high-quality model audit (2026-10-31)

Regenerate: \`node --import tsx scripts/auditBvModelQuality.mts\`

## Rules

- Authorship does not establish quality. Single/default/unspecified models are treated as Low.
- High evidence: highDetail/ultraDetail, registered high/ultra factories, or explicit high preview metadata backed by a high/low factory.
- Triangle counts, names and hardcoded BV labels do not establish quality. Opus-only High remains a missing Codex edition. Codex Ultra qualifies as an existing detailed edition.
- Records correspond to BV entries and author editions, including size/state previews and duplicate presentations of shared factories. These totals are not counts of unique assets. Catalogue massing and separate exterior studies are listed separately.
- Excludes trees (Medieval 43) and the crag/escarpment terrain diagnostics. Interactive sign combinations, wall cultures and castle phases are not counted as additional assets.

## Summary

Records: **${rows.length}**. Codex High or Ultra available: **${completed.length}**. Missing candidates: **${missing.length}**.

| Category | Records | Codex High available | Missing candidates |
| --- | ---: | ---: | ---: |
${summary.join("\n")}

## Completed batches and next work

1. Fixed the unspecified-quality fallback and the hardcoded town-wall High labels to Low. Preserved explicit high/low factories for facilities, bridges and the Opus galleon.
2. Added new Codex High factories for farm-barn, threshing-barn and hay-shelter. BV offers Low/High; the old create factory remains unchanged as Low. No existing CE adoption was switched.
3. Second batch (2026-11-01): added High for the three Medieval 02 boundaries and four Medieval 04 animal houses. See [verification and previews](bv-boundary-animal-high-20261101.md).
4. Third batch (2026-11-01): added High for the two Medieval 05 troughs and two Medieval 06 market stalls. See [verification and previews](bv-trough-market-high-20261101.md).
5. Fourth batch (2026-11-01): added High for the three Medieval 07 dwellings and two Medieval 08 shop houses. The existing default dwelling variants remain registered for CE. See [verification and previews](bv-dwelling-shop-high-20261101.md).
6. Fifth batch (2026-11-01): added High for the three Medieval 09 hand carts and three Medieval 10 bakeries. See [verification and previews](bv-cart-bakery-high-20261101.md).
7. Sixth batch (2026-11-01): added High for the two Medieval 11 smithies and two Medieval 12 inns. Existing default smithy variants remain registered for CE. See [verification and previews](bv-smithy-inn-high-20261101.md).
8. Next: Medieval 13 fuel storage, followed by 14 parish churches. Preserve their existing default CE variants when adding BV tiers. Landmarks, standalone props, regional houses and the Codex basilica form later batches.
9. Regenerate this report after each batch. Verify geometry, dimensions, projections, ownership and BV selection. Relabelling or subdividing an existing basic model does not complete High.

## First-batch verification (2026-11-01 JST)

- Related Vitest tests: modelComparison (5), adoption (3), barnDetails (5), all passed. The new doorway ray test initially detected a central post obstruction; the post was removed and the five barn tests passed on rerun.
- TypeScript: \`npx tsc --noEmit\` passed. Biome checks passed for changed source files; \`git diff --check\` passed.
- Live BV: all three models switched between Low and High with Codex authorship and separate complexity columns. Basic timber fence and town wall displayed Low; explicit citadel/bridge previews retained High.
- Browser console: no model/application errors; an unrelated favicon.ico 404 was observed.

| Model | Low triangles | High triangles | High meshes | Preview |
| --- | ---: | ---: | ---: | --- |
| Timber farm barn | 2,310 | 11,780 | 5 | [High](bv-farm-barn-high-20261101.png) |
| Threshing barn | 1,134 | 13,688 | 7 | [High](bv-threshing-barn-high-20261101.png) |
| Open hay shelter | 1,228 | 8,592 | 5 | [High](bv-hay-shelter-high-20261101.png) |

## Missing Codex High candidates

${table(missing)}

## Codex High available

${table(completed)}
`;
await writeFile("docs/analytics/bv-non-tree-high-quality-audit-20261031.md", report);
console.log(JSON.stringify({ records: rows.length, codexHigh: completed.length, missing: missing.length }));
