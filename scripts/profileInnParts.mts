import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import * as THREE from "three";
import { collectModelMetrics } from "../src/building-viewer/modelMetrics";
import { modelParts } from "../src/buildings/modelParts";
import { models } from "../src/buildings/medieval/12-innsModels";
import type { CityStructureMeshes } from "../src/city3d/three/structureMeshes";

// Captured before splitting Inns. Triangle order across material buckets is irrelevant.
const baseline = {
  "roadside-inn/low": "172bdea8adb1672812a787d666a770d54ca3b14fd1380d88f17bf1984aa7b47c",
  "roadside-inn/high": "b3faaa5f0af20ff0a2b672442d0f3c32fcbddf4dc72fb7cce69ef43f23b4e0bd",
  "courtyard-hostelry/low": "150f83d85aa92ae7e1c22e6af111405865e7754b714e7ae5f577f4df30504752",
  "courtyard-hostelry/high": "f5820eb7aa9a88bf671704764230ba0c17f6ea6762c255d4e3fda85267bbfafb"
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
const output = process.argv[2] ?? "docs/analytics/bv-inn-parts-p3-20261101.json";
await writeFile(output, JSON.stringify({
  runtime: process.version,
  method: "SHA-256 over sorted triangle strings: material color hex and side, then oriented world vertices rounded to 5 decimals. Normals, mesh names and resource identity are excluded. Baseline was captured before component extraction. Every registered model, composition and single component is independently built, counted and disposed. Source-part mesh counts in ledgers precede final material batching.",
  rows
}, null, 2) + "\n");
console.log(rows.map(row => ({ id: row.id, quality: row.quality, matchesBaseline: row.standard.matchesBaseline, metrics: row.standard.metrics })));
if (rows.some(row => !row.standard.matchesBaseline)) process.exitCode = 1;
