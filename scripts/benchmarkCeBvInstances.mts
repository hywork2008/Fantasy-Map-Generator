/** node --import tsx scripts/benchmarkCeBvInstances.mts */
import { writeFileSync } from "node:fs";
import os from "node:os";
import * as THREE from "three";
import { createMedievalWellModel } from "../src/buildings/wells/medievalWell";
import { createBvInstances, createBvPrototypeCache } from "../src/city3d/three/bvInstances";
import { CE_CHAPEL } from "../src/city3d/three/specialBuildingMeshes";

const definitions = [CE_CHAPEL, { id: "well", create: createMedievalWellModel }];
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const results: object[] = [];
for (const definition of definitions) {
  const reference = definition.create();
  const sourceMeshes = reference.pickables.length;
  const sourceMaterials = new Set(
    reference.pickables.flatMap(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]))
  ).size;
  const sourceTriangles = reference.pickables.reduce(
    (n, mesh) => n + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3,
    0
  );
  reference.dispose();
  for (const count of [1, definition === CE_CHAPEL ? 10 : 1000]) {
    const samples: { coldMs: number; refreshMs: number }[] = [];
    let metrics = {};
    for (let pass = 0; pass < 4; pass++) {
      const cache = createBvPrototypeCache();
      const sites = Array.from({ length: count }, (_, i) => ({
        id: `${definition.id}-${i}`,
        definition,
        matrix: new THREE.Matrix4().makeTranslation((i % 32) * 24, 0, Math.floor(i / 32) * 24)
      }));
      const start = performance.now();
      const layer = createBvInstances(sites, cache);
      const coldMs = performance.now() - start;
      const refreshStart = performance.now();
      const next = createBvInstances(sites, cache);
      layer.dispose();
      const refreshMs = performance.now() - refreshStart;
      metrics = {
        meshes: next.pickables.length,
        triangles: sourceTriangles * count,
        bufferBytes: next.pickables.reduce(
          (n, mesh) =>
            n +
            mesh.instanceMatrix.array.byteLength +
            Object.values(mesh.geometry.attributes).reduce((s, attr) => s + attr.array.byteLength, 0),
          0
        )
      };
      next.dispose();
      if (cache.size) throw new Error("Leaked BV prototype");
      if (pass) samples.push({ coldMs, refreshMs });
    }
    results.push({
      id: definition.id,
      count,
      sourceMeshes,
      sourceMaterials,
      sourceTriangles,
      ...metrics,
      coldMs: median(samples.map(s => s.coldMs)),
      refreshMs: median(samples.map(s => s.refreshMs)),
      samples
    });
  }
}
const report = {
  date: new Date().toISOString(),
  cpu: os.cpus()[0].model,
  node: process.version,
  environment: "Node CPU wall time; one warmup, median of 3; no GPU timing or FPS measurement",
  results
};
writeFileSync("docs/analytics/ce-bv-instances-benchmark.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
