import { writeFile } from "node:fs/promises";
import * as THREE from "three";
import { collectModelMetrics } from "../src/building-viewer/modelMetrics";
import { models } from "../src/buildings/medieval/44-cemetery-facilitiesModels";
import { modelParts } from "../src/buildings/modelParts";
import { landmarkFingerprint } from "./lib/landmarkFingerprint.mts";

const rows = [];
for (const definition of models.filter(model => ["ossuary-charnel-house", "skull-shelf"].includes(model.id))) for (const variant of definition.variants!) {
  const model = variant.create(), buffers = new Set<ArrayBufferLike>();
  for (const mesh of model.pickables) for (const attribute of [...Object.values(mesh.geometry.attributes), mesh.geometry.index])
    if (attribute) buffers.add(("array" in attribute ? attribute.array : attribute.data.array).buffer);
  const parts = [];
  for (const factory of definition.parts!(variant.id)) {
    const solo = definition.assembleParts!([factory]);
    parts.push({ id: factory.id, role: factory.role, quality: factory.quality, metrics: collectModelMetrics(solo.group) });
    solo.dispose();
  }
  rows.push({ id: variant.id, quality: variant.level, author: variant.author, metrics: collectModelMetrics(model.group),
    attributeBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0),
    dimensions: new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3()).toArray(),
    fingerprint: landmarkFingerprint(model.group), sourceParts: modelParts(model.group), parts });
  model.dispose();
}
await writeFile("docs/analytics/bv-ossuary-high-20261102.json", JSON.stringify({
  method: "Fixed BV variant geometry. Dimensions X/Y/Z metres. Unique CPU attribute/index ArrayBuffers exclude JS objects, transient allocations and GPU memory; no FPS benchmark.", rows
}, null, 2) + "\n");
console.log(rows.map(({ quality, metrics, attributeBytes, dimensions }) => ({ quality, metrics, attributeBytes, dimensions })));
