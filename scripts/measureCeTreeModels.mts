/** Model inventory, not a frame/GPU benchmark: node --import tsx scripts/measureCeTreeModels.mts <output.json> */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as THREE from "three";
import { TREE_QUALITIES } from "../src/buildings/landscape/treeQuality";
import { hasTreeQualityLevels, TREE_SPECIES } from "../src/buildings/landscape/trees";
import { models } from "../src/buildings/medieval/43-landscape-treesModels";
import { adoptedTree } from "../src/city3d/adoption";
import { STANDARD_BIOME_DEFINITIONS } from "../src/data/biomeCatalog";

const output = resolve(process.argv[2] ?? "docs/analytics/ce-tree-lod-inventory.json");
const sources = [
  ...readdirSync("src/buildings/landscape")
    .filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map(name => `src/buildings/landscape/${name}`),
  "src/buildings/medieval/43-landscape-treesModels.ts",
  "src/city3d/adoption.ts",
  "src/data/biomeCatalog.ts"
];
const results = TREE_SPECIES.flatMap(species =>
  (hasTreeQualityLevels(species) ? TREE_QUALITIES : (["default"] as const)).map(quality => {
    const variant = adoptedTree(species, quality === "default" ? "ultra" : quality);
    const start = performance.now();
    const model = variant.create();
    const buildMs = performance.now() - start;
    try {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      let triangles = 0,
        meshes = 0;
      model.group.traverseVisible(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        meshes++;
        geometries.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
        triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;
      });
      const box = new THREE.Box3().setFromObject(model.group);
      if (!meshes || !triangles || box.isEmpty()) throw new Error(`Empty model: ${species}/${quality}`);
      let bufferBytes = 0;
      for (const geometry of geometries) {
        bufferBytes += geometry.index?.array.byteLength ?? 0;
        for (const attribute of Object.values(geometry.attributes)) bufferBytes += attribute.array.byteLength;
      }
      return {
        species,
        quality,
        variant: variant.id,
        author: variant.author,
        triangles,
        meshes,
        materials: materials.size,
        bufferBytes,
        bounds: { min: box.min.toArray(), max: box.max.toArray() },
        buildMs
      };
    } finally {
      model.dispose();
    }
  })
);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  `${JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      conditions:
        "One CPU build per adopted model; no warm-up, frame timing, GPU memory or GPU rendering measured. bufferBytes counts source geometry attributes/indices only.",
      sourceSha256: Object.fromEntries(
        sources.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])
      ),
      biomes: STANDARD_BIOME_DEFINITIONS.map(definition => ({ key: definition.key, tags: definition.tags })),
      models: models.map(model => ({ id: model.id, name: model.name, biomes: model.biomes ?? [] })),
      results
    },
    null,
    2
  )}\n`
);
console.log(
  `Wrote ${results.length} model entries for ${TREE_SPECIES.length} species and ${STANDARD_BIOME_DEFINITIONS.length} biomes to ${output}`
);
