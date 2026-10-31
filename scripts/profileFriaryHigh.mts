import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import * as THREE from "three";
import { collectModelMetrics } from "../src/building-viewer/modelMetrics";
import { models } from "../src/buildings/medieval/33-friariesModels";
import { modelParts } from "../src/buildings/modelParts";
import { friaryPreviewPlan } from "../src/buildings/monasteries/friary";
import { createTownMonasteries } from "../src/city3d/three/friaryMeshes";

function metrics(root: THREE.Object3D) {
  const buffers = new Set<ArrayBufferLike>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const attribute of [...Object.values(mesh.geometry.attributes), mesh.geometry.index]) {
      if (!attribute) continue;
      buffers.add(("array" in attribute ? attribute.array : attribute.data.array).buffer);
    }
  });
  return { ...collectModelMetrics(root), attributeBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0) };
}

const definition = models[0], rows = [];
for (const variant of definition.variants!) {
  const start = performance.now();
  const model = variant.create();
  const buildMs = +(performance.now() - start).toFixed(2);
  const bounds = new THREE.Box3().setFromObject(model.group);
  const parts = [];
  for (const factory of definition.parts!(variant.id)) {
    const solo = definition.assembleParts!([factory]);
    parts.push({ id: factory.id, role: factory.role, quality: factory.quality, metrics: metrics(solo.group) });
    solo.dispose();
  }
  rows.push({ id: variant.id, author: variant.author, level: variant.level, basedOn: variant.basedOn, metrics: metrics(model.group), buildMs, dimensions: bounds.getSize(new THREE.Vector3()).toArray(), sourceParts: modelParts(model.group), displayParts: parts });
  model.dispose();
}
const ce = createTownMonasteries([friaryPreviewPlan()]);
const ceDefault = { variants: ce.group.userData.modelVariants, metrics: metrics(ce.group), sourceParts: modelParts(ce.group) };
ce.dispose();
const output = process.argv[2] ?? "docs/analytics/bv-friary-high-p4-20261101.json";
await writeFile(output, JSON.stringify({
  runtime: process.version,
  method: "Fixed fitted preview. Buffer bytes count unique CPU ArrayBuffers, excluding JS objects, GPU memory and transient allocations. Build time is a single order-dependent observation and is not an FPS benchmark. Source-part counts precede final compaction; display-part counts use BV's selected-part assembly path. Dimensions are X/Y/Z in metres. CE default is measured through createTownMonasteries.",
  rows, ceDefault
}, null, 2) + "\n");
console.log(rows.map(({ id, metrics, buildMs }) => ({ id, metrics, buildMs })));
console.log({ ceDefault: ceDefault.variants, metrics: ceDefault.metrics });
