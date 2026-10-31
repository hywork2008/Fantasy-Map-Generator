import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type * as THREE from "three";
import { collectModelMetrics } from "../src/building-viewer/modelMetrics";
import { createLandscapeTree } from "../src/buildings/landscape/trees";
import { model as salisbury } from "../src/buildings/landmarks/salisbury";
import { createMonastery, monasteryPreviewPlan } from "../src/buildings/monasteries/friary";
import { createMedievalWellModel } from "../src/buildings/wells/medievalWell";
import { createTownMonasteries } from "../src/city3d/three/friaryMeshes";
import type { CityStructureMeshes } from "../src/city3d/three/structureMeshes";

function metrics(root: THREE.Object3D) {
  const buffers = new Set<ArrayBufferLike>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const attribute of [...Object.values(mesh.geometry.attributes), mesh.geometry.index]) {
      if (!attribute) continue;
      const array = "array" in attribute ? attribute.array : attribute.data.array;
      buffers.add(array.buffer);
    }
  });
  return { ...collectModelMetrics(root), attributeBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0) };
}

const rows: object[] = [];
function measure(id: string, create: () => CityStructureMeshes, parts = false) {
  const started = performance.now();
  const model = create();
  const buildMs = performance.now() - started;
  const row = {
    id, buildMs: +buildMs.toFixed(2), ...metrics(model.group),
    ...(parts ? { parts: model.group.children.map(child => ({ name: child.name, ...metrics(child) })) } : {})
  };
  rows.push(row);
  console.log(JSON.stringify({ ...row, parts: undefined }));
  model.dispose();
}

for (const kind of ["friary", "abbey", "orthodoxMonastery"] as const) {
  const plan = monasteryPreviewPlan(kind);
  const withoutTrees = { ...plan, trees: [] };
  rows.push({ id: `${kind}/plan`, treeCount: plan.trees.length, buildingCount: plan.buildings.length });
  measure(`${kind}/BV-legacy-ultra`, () => createMonastery(plan, 0, 0, { vegetationQuality: "ultra" }), true);
  measure(`${kind}/BV-current-low`, () => createMonastery(plan));
  measure(`${kind}/BV-without-trees`, () => createMonastery(withoutTrees));
  if (kind === "friary") {
    measure(`${kind}/BV-without-trees-or-well`, () => createMonastery({ ...withoutTrees, well: undefined }));
    measure(`${kind}/CE-current-low`, () => createTownMonasteries([plan]));
    measure(`${kind}/CE-without-trees`, () => createTownMonasteries([withoutTrees]));
  }
}
measure("medieval-well/current", () => createMedievalWellModel(), true);
for (const quality of ["low", "medium", "high", "ultra"] as const)
  measure(`garden_parkland/${quality}`, () => createLandscapeTree("garden_parkland", quality));
measure("salisbury/low", () => salisbury.create());
measure("salisbury/high", () => salisbury.highDetail!.create());
for (const file of ["08-shop-housesModels", "10-bakeriesModels", "12-innsModels", "15-breweriesModels"]) {
  const { models } = await import(`../src/buildings/medieval/${file}.ts`);
  for (const model of models) {
    for (const variant of model.variants ?? [])
      measure(`${model.id}/${variant.level}`, () => variant.create());
  }
}
const output = process.argv[2] ?? "docs/analytics/bv-composite-profile-20261101.json";
await writeFile(output, JSON.stringify({
  runtime: process.version,
  method: "One deterministic preview per factory, disposed after counting. Build time is a single order-dependent observation with mixed cache/JIT state, not FPS or a benchmark. Attribute bytes count unique CPU ArrayBuffers including indices, excluding JS objects, GPU allocations and transient clones. BV-without-trees omits trees before construction; all other plan fields are unchanged. Parts share resources and their unique-resource counts must not be summed. CE cases include indexed-to-nonindexed conversion and merge. BV-legacy-ultra reproduces the former implicit vegetation tier explicitly; current-low uses the corrected default.",
  rows
}, null, 2) + "\n");
