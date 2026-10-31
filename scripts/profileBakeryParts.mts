import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import * as THREE from "three";
import { collectModelMetrics } from "../src/building-viewer/modelMetrics";
import { modelParts } from "../src/buildings/modelParts";
import { models } from "../src/buildings/medieval/10-bakeriesModels";
import type { CityStructureMeshes } from "../src/city3d/three/structureMeshes";

// Captured before splitting Bakeries. Triangle order across material buckets is irrelevant.
const baseline = {
  "bread-bakehouse/low": "33b665ee54b42bbfe5cd311411435039739ad5f7e1b459d2ba9f9e431bbd008f",
  "bread-bakehouse/high": "9e76e1bc8b4a846df9646e2f96c9e830a84cef909e3768621aff5eb851356bff",
  "town-bakery/low": "5a17bdc3460ac3e29105b1d5bbac3bbc4a8b2396ea070d191ea0fe89e5634c55",
  "town-bakery/high": "79d74956a88a457032ff5ddcb968e2e1e0f033ae3e6bd732661aa8dd5b94afbf",
  "communal-bread-oven/low": "166221c43a52abce74deae93aaa8d84fbb9f54288088d074b784e6a9d295edd3",
  "communal-bread-oven/high": "347ab434114ff61d031385bfe62225dc79ea8a6e2049ad70c711c5b430a6ec17"
};

function digest(model: CityStructureMeshes) {
  model.group.updateMatrixWorld(true);
  const triangles: string[] = [];
  for (const mesh of model.pickables) {
    const geometry = mesh.geometry, position = geometry.getAttribute("position");
    const material = mesh.material as THREE.MeshLambertMaterial;
    for (let i = 0; i < (geometry.index?.count ?? position.count); i += 3) {
      const row: (string | number)[] = [material.color.getHexString(), material.side];
      for (let j = 0; j < 3; j++) {
        const point = new THREE.Vector3().fromBufferAttribute(position, geometry.index?.getX(i + j) ?? i + j).applyMatrix4(mesh.matrixWorld);
        row.push(...point.toArray().map(n => n.toFixed(5)));
      }
      triangles.push(row.join(","));
    }
  }
  return createHash("sha256").update(triangles.sort().join("\n")).digest("hex");
}

const rows = [];
for (const definition of models) {
  for (const variant of definition.variants!) {
    const registered = variant.create();
    const key = `${definition.id}/${variant.level}` as keyof typeof baseline;
    const sha256 = digest(registered);
    const standard = { metrics: collectModelMetrics(registered.group), baseline: baseline[key], sha256, matchesBaseline: sha256 === baseline[key] };
    registered.dispose();
    const compositions = [];
    for (const preset of definition.partPresets!) {
      const factories = definition.parts!(variant.id, preset.id);
      const model = definition.assembleParts!(factories);
      compositions.push({ id: preset.id, metrics: collectModelMetrics(model.group), parts: modelParts(model.group) });
      model.dispose();
    }
    const components = [];
    for (const part of definition.parts!(variant.id)) {
      const solo = definition.assembleParts!([part]);
      components.push({ id: part.id, role: part.role, quality: part.quality, metrics: collectModelMetrics(solo.group) });
      solo.dispose();
    }
    rows.push({ id: definition.id, quality: variant.level, standard, compositions, components });
  }
}
const output = process.argv[2] ?? "docs/analytics/bv-bakery-parts-p3-20261101.json";
await writeFile(output, JSON.stringify({
  runtime: process.version,
  method: "SHA-256 over sorted triangle strings: material color hex and side, then oriented world vertices rounded to 5 decimals. Normals, mesh names and resource identity are excluded. Baseline was captured before component extraction. Every registered model, composition and single component is independently built, counted and disposed. Source-part mesh counts in ledgers precede final material batching.",
  rows
}, null, 2) + "\n");
console.log(rows.map(row => ({ id: row.id, quality: row.quality, matchesBaseline: row.standard.matchesBaseline, metrics: row.standard.metrics })));
if (rows.some(row => !row.standard.matchesBaseline)) process.exitCode = 1;
