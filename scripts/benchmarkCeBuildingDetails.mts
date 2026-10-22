/** node --import tsx scripts/benchmarkCeBuildingDetails.mts */
import { writeFileSync } from "node:fs";
import os from "node:os";
import * as THREE from "three";
import { buildingAppearancePreview } from "../src/city-editor/generators/buildingAppearancePreview";
import { createCityMassing } from "../src/city3d/three/cityMeshes";
import { BUILDING_DETAIL_BUDGET, createTownBuildingDetails } from "../src/city3d/three/buildingDetails";

const source = buildingAppearancePreview("northern-urban")[0];
const lots = Array.from({ length: 1000 }, (_, i) => ({
  ...source,
  id: `facade-bench-${i}`,
  polygon: source.polygon.map(
    ([x, y]) => [x + (i % 32) * 12 - 180, y + Math.floor(i / 32) * 12 - 180] as [number, number]
  )
}));
const camera = new THREE.PerspectiveCamera(45, 1.4, 0.1, 10000);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const results: object[] = [];
for (const [name, height, distance] of [
  ["far", 720, 1800],
  ["near", 720, 65],
  ["budget", 2000, 120]
] as const) {
  const samples: { prepareMs: number; coldMs: number; idleMs: number; warmMoveMs: number }[] = [];
  let summary = {};
  for (let pass = 0; pass < 4; pass++) {
    const start = performance.now();
    const details = createTownBuildingDetails(lots);
    const prepareMs = performance.now() - start;
    camera.position.set(0, distance, distance);
    camera.lookAt(0, 3, 0);
    const cold = performance.now();
    details.update(camera, height);
    const coldMs = performance.now() - cold;
    const idle = performance.now();
    for (let i = 0; i < 100; i++) details.update(camera, height);
    const idleMs = (performance.now() - idle) / 100;
    camera.position.x += 0.01;
    const move = performance.now();
    details.update(camera, height);
    const warmMoveMs = performance.now() - move;
    if (pass) samples.push({ prepareMs, coldMs, idleMs, warmMoveMs });
    summary = {
      ...details.stats,
      meshes: details.group.children.length,
      bufferBytes: details.group.children.reduce(
        (n, child) =>
          n +
          Object.values((child as THREE.Mesh).geometry.attributes).reduce(
            (sum, attr) => sum + attr.array.byteLength,
            0
          ),
        0
      )
    };
    details.dispose();
  }
  results.push({
    mode: name,
    ...summary,
    ...Object.fromEntries(
      Object.keys(samples[0]).map(key => [key, median(samples.map(sample => sample[key as keyof typeof sample]))])
    ),
    samples
  });
}
const base = createCityMassing(lots);
const report = {
  date: new Date().toISOString(),
  cpu: os.cpus()[0].model,
  node: process.version,
  environment:
    "Node CPU wall time, 1 warmup + median of 3; 1000 repeated CE preview lots, no rasterization or GPU timing",
  budget: BUILDING_DETAIL_BUDGET,
  base: {
    buildings: lots.length,
    meshes: base.pickables.length,
    triangles: base.pickables.reduce((n, mesh) => n + mesh.geometry.getAttribute("position").count / 3, 0)
  },
  results
};
writeFileSync("docs/analytics/ce-building-details-benchmark.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
base.dispose();
