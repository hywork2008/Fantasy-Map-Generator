import { landmarkFingerprint as fingerprint } from "./lib/landmarkFingerprint.mts";
import { writeFile } from "node:fs/promises";
import * as THREE from "three";
import { collectModelMetrics } from "../src/building-viewer/modelMetrics";
import { model } from "../src/buildings/landmarks/notreDame";
import { modelParts } from "../src/buildings/modelParts";


const rows = [];
for (const [quality, definition] of [["low", model], ["high", model.highDetail!]] as const) {
  const assembly = definition.create();
  const buffers = new Set<ArrayBufferLike>();
  for (const mesh of assembly.pickables) {
    for (const attribute of [...Object.values(mesh.geometry.attributes), mesh.geometry.index]) {
      if (attribute) buffers.add(("array" in attribute ? attribute.array : attribute.data.array).buffer);
    }
  }
  const parts = [];
  for (const factory of definition.parts?.() ?? []) {
    const solo = definition.assembleParts!([factory]);
    parts.push({ id: factory.id, role: factory.role, quality: factory.quality, metrics: collectModelMetrics(solo.group) });
    solo.dispose();
  }
  rows.push({ quality, metrics: collectModelMetrics(assembly.group),
    attributeBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0),
    dimensions: new THREE.Box3().setFromObject(assembly.group).getSize(new THREE.Vector3()).toArray(),
    fingerprint: fingerprint(assembly.group), sourceParts: modelParts(assembly.group), parts });
  assembly.dispose();
}
const output = process.argv[2] ?? "docs/analytics/bv-notre-dame-chapel-window-fix-20261101.json";
await writeFile(output, JSON.stringify({ method: "World-space triangles and normals rounded to 1e-5, with winding and material settings, sorted independently of batching. Buffer bytes count unique CPU ArrayBuffers only; no GPU/FPS benchmark.", rows }, null, 2) + "\n");
console.log(rows.map(({ quality, metrics, attributeBytes, fingerprint }) => ({ quality, metrics, attributeBytes, fingerprint })));
