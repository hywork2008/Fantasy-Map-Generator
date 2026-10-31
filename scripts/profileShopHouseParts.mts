import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import * as THREE from "three";
import { collectModelMetrics } from "../src/building-viewer/modelMetrics";
import { modelParts } from "../src/buildings/modelParts";
import { models } from "../src/buildings/medieval/08-shop-housesModels";
import type { CityStructureMeshes } from "../src/city3d/three/structureMeshes";

// Captured before splitting Shop Houses. Triangle order across material buckets is irrelevant.
const baseline = {
  "merchant-shop-house/low": "0199c4bb1b6d7dfcba00c6c2203f650b527fbbf22930e30d3ba0dfde0aa809ce",
  "merchant-shop-house/high": "867a5b49fbcbbd126fafc9dff2f78133b199a4584002e8ddf89b0d3a40c3c012",
  "artisan-shop-house/low": "5033bb45b684f855042b4fcedd2b1417d2cd9ed311c69b1886441893db4ea9a3",
  "artisan-shop-house/high": "b8fe4427396dfc00723c7ba1bd4250873852ece8464c9ced57dd071509ed7f40"
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
const output = process.argv[2] ?? "docs/analytics/bv-shop-house-parts-p3-20261101.json";
await writeFile(output, JSON.stringify({
  runtime: process.version,
  method: "SHA-256 over sorted triangle strings: material color hex and side, then oriented world vertices rounded to 5 decimals. Normals, mesh names and resource identity are excluded. Baseline was captured before component extraction. Every registered model, composition and single component is independently built, counted and disposed. Source-part mesh counts in ledgers precede final material batching.",
  rows
}, null, 2) + "\n");
console.log(rows.map(row => ({ id: row.id, quality: row.quality, matchesBaseline: row.standard.matchesBaseline, metrics: row.standard.metrics })));
if (rows.some(row => !row.standard.matchesBaseline)) process.exitCode = 1;
