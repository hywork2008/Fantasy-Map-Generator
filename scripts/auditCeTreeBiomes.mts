/** Fixed semantic audit, not a rendering/performance benchmark. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { models } from "../src/buildings/medieval/43-landscape-treesModels";
import { BURIAL_CULTURE_PRESETS } from "../src/data/burialCultures";
import { STANDARD_BIOME_DEFINITIONS } from "../src/data/biomeCatalog";
import { STANDARD_BIOME_KEYS } from "../src/types/biome";
import { createDocument } from "../src/city-editor/generators/document";
import { forestLandCover, withForestSettings } from "../src/city-editor/generators/forestLandCover";
import { landscapeHasTrees, TREE_BIOME_POLICY } from "../src/city-editor/generators/landscapeVegetation";
import { landscapeTreeSpecies } from "../src/city-editor/renderers/landscapeTreeSpecies";
import { collectOpenSpacePlan } from "../src/city-editor/renderers/openSpaceSites";
import type { CemeteryPlan } from "../src/city-editor/types/document";

const output = process.argv[2] ?? "docs/analytics/ce-tree-biome-policy-20261029.json";
const points = Array.from({ length: 64 }, (_, i) => [17 * i, 23 * i] as [number, number]);
assert.deepEqual(Object.keys(TREE_BIOME_POLICY).sort(), [...STANDARD_BIOME_KEYS].sort());
const results = STANDARD_BIOME_DEFINITIONS.map(biome => {
  const city = withForestSettings(createDocument("flora-matrix-v1", 100), { version: 1, mode: "surroundings", density: "standard" });
  city.biome = { id: 1, key: biome.key, name: biome.label, color: biome.color, tags: [...biome.tags] };
  for (const face of Object.values(city.mesh.faces)) Object.assign(face.properties, { ward: "farm", settlement: "outskirts", water: "land" });
  const cultures = Object.values(BURIAL_CULTURE_PRESETS).map(profile => {
    const cemetery: CemeteryPlan = { id: "audit", version: 1, seed: "audit", faceId: "f0", form: "churchyard", boundary: [], courtyards: [], parts: [], accesses: [], trees: [[5, 5]], provenance: "generated", locked: false, burialProfile: profile };
    const tree = collectOpenSpacePlan([], [cemetery], city).sites.find(site => site.point[0] === 5 && site.point[1] === 5);
    return { culture: profile.id, preferred: profile.vegetation, rendered: tree?.model ?? null };
  });
  const temperatures = [undefined, -5, 3, 3.01, 19.99, 20, 30].map(temperatureC => {
    city.buildingAppearanceContext = { period: "medieval", forest: true, arid: false, wetland: false, temperatureC };
    const counts: Record<string, number> = {};
    for (const point of points) {
      const species = landscapeTreeSpecies("garden_parkland", city, point) ?? "none";
      counts[species] = (counts[species] ?? 0) + 1;
    }
    return { temperatureC: temperatureC ?? null, counts };
  });
  return { biome: biome.key, zone: TREE_BIOME_POLICY[biome.key as keyof typeof TREE_BIOME_POLICY], treesAllowed: landscapeHasTrees(city), selectedForestFaces: forestLandCover(city).size, temperatures, cultures };
});
for (const result of results) if (!result.treesAllowed) {
  assert.equal(result.selectedForestFaces, 0);
  assert.ok(result.temperatures.every(t => t.counts.none === 64));
  assert.ok(result.cultures.every(c => c.rendered === null));
}
const sources = ["scripts/auditCeTreeBiomes.mts", "src/city-editor/generators/landscapeVegetation.ts", "src/city-editor/renderers/landscapeTreeSpecies.ts", "src/city-editor/generators/forestLandCover.ts", "src/city-editor/generators/forestPlan.ts", "src/city-editor/generators/parkFabric.ts", "src/city-editor/generators/cemeteryLayout.ts", "src/city-editor/generators/cultureCemeteryLayout.ts", "src/city-editor/renderers/forestSvg.ts", "src/city-editor/renderers/openSpaceSites.ts", "src/city-editor/renderers/cultureCemeterySvg.ts", "src/city-editor/renderers/cemeterySvg.ts", "src/city-editor/renderers/landscape.ts", "src/city-editor/renderers/townStructuresSvg.ts", "src/city3d/three/forestMeshes.ts", "src/buildings/medieval/43-landscape-treesModels.ts", "src/data/biomeCatalog.ts", "src/data/burialCultures.ts"];
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify({ conditions: "One fixed city/seed; 29 biomes, 7 temperatures, 64 fixed points, all burial culture profiles. Semantic audit only; no visual/GPU/p95 measurement.", sourceSha256: Object.fromEntries(sources.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])), bvBiomes: models.map(model => ({ model: model.id, biomes: model.biomes ?? [] })), results }, null, 2)}\n`);
console.log(`Audited ${results.length} biomes, ${Object.values(BURIAL_CULTURE_PRESETS).length} burial cultures; wrote ${output}`);
