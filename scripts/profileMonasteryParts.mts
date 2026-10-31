import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import * as THREE from "three";
import { collectModelMetrics } from "../src/building-viewer/modelMetrics";
import { createModelAssembly } from "../src/buildings/modelParts";
import { createMonastery, monasteryPartFactories, monasteryPreviewPlan } from "../src/buildings/monasteries/friary";

// Captured from the P1 factory before splitting components, using the exact method below.
const baseline = {
  friary: "d1b9325efad320ec36d4858b909b7d3ded6d93acb4ab9a427909e65ce0f28698",
  abbey: "14cda5e0637bb5e156e6d19aaa3a9263b014c9c3fe3ca0a88d2f7d8dcf2e377d",
  orthodoxMonastery: "f26d56bd6d03639710c829e1867e167b7fa1cac75bb6c966d6f04293bc8fba58"
};

const rows = [];
for (const kind of ["friary", "abbey", "orthodoxMonastery"] as const) {
  const plan = monasteryPreviewPlan(kind);
  const full = createMonastery(plan, 3, -1);
  const hash = createHash("sha256");
  full.group.updateMatrixWorld(true);
  for (const mesh of full.pickables) {
    hash.update(mesh.name);
    hash.update((mesh.material as THREE.MeshLambertMaterial).color.getHexString());
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    for (let i = 0; i < (geometry.index?.count ?? position.count); i++) {
      const point = new THREE.Vector3().fromBufferAttribute(position, geometry.index?.getX(i) ?? i).applyMatrix4(mesh.matrixWorld);
      hash.update([point.x, point.y, point.z].map(n => n.toFixed(5)).join(","));
    }
  }
  const sha256 = hash.digest("hex");
  const parts = [];
  for (const factory of monasteryPartFactories(plan, 3, -1)) {
    const { create, ...definition } = factory;
    const solo = createModelAssembly("solo", [factory]);
    const bounds = new THREE.Box3().setFromObject(solo.group);
    parts.push({ ...definition, ...collectModelMetrics(solo.group), min: bounds.min.toArray(), max: bounds.max.toArray() });
    solo.dispose();
  }
  rows.push({ kind, baseline: baseline[kind], sha256, matchesBaseline: baseline[kind] === sha256, metrics: collectModelMetrics(full.group), parts });
  full.dispose();
}
const output = process.argv[2] ?? "docs/analytics/bv-monastery-parts-p2-20261101.json";
await writeFile(output, JSON.stringify({
  runtime: process.version,
  method: "Fixed plans at elevation 3 and foundationBottom -1. SHA-256 streams mesh name, material RGB hex, then triangle vertices in pickable order, world coordinates rounded to 5 decimals. It excludes normals and object/resource identity. Every component is separately constructed and disposed for its metrics and bounds. Full metrics include the foundation.",
  rows
}, null, 2) + "\n");
console.log(rows.map(({ kind, sha256, matchesBaseline, metrics }) => ({ kind, sha256, matchesBaseline, metrics })));
if (rows.some(row => !row.matchesBaseline)) process.exitCode = 1;
