/** F0 structural analysis only: node --import tsx scripts/analyzeCeForestChunks.mts */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import type { CityDocument, Point } from "../src/city-editor/types/document";
import { buildBlockFabric } from "../src/city-editor/generators/blockInfill";
import { pointInPolygon } from "../src/city-editor/generators/geom";
import { cityTerrain } from "../src/city-editor/generators/terrainElevation";

const reportPath = "docs/analytics/ce-forest-f0/results.json";
const source = readFileSync(reportPath);
const report = JSON.parse(source.toString());
if (report.results.length !== 3) throw new Error("Run all three F0 fixtures first");
const results = report.results.map((row: { fixture: { id: string }; sampling: { all: number; edge: number } }) => {
  const city: CityDocument = JSON.parse(readFileSync(`docs/analytics/raw/ce-forest-f0/${row.fixture.id}.json`, "utf8"));
  const terrain = cityTerrain(city);
  const points = new Map<string, Point>();
  const step = 8;
  // Match the browser load probe. The matching count below prevents silent drift.
  for (const farm of buildBlockFabric(city).farms) {
    const xs = farm.polygon.map(p => p[0]),
      ys = farm.polygon.map(p => p[1]);
    for (let x = Math.floor(Math.min(...xs) / step); x <= Math.ceil(Math.max(...xs) / step); x++)
      for (let y = Math.floor(Math.min(...ys) / step); y <= Math.ceil(Math.max(...ys) / step); y++) {
        const p: Point = [(x + 0.5) * step, (y + 0.5) * step];
        if (pointInPolygon(p, farm.polygon)) points.set(`${x},${y}`, p);
      }
  }
  if (points.size !== row.sampling.all) throw new Error(`Sample count mismatch: ${row.fixture.id}`);
  const radius = city.frame.cityRadiusMeters;
  const poses = [
    { name: "overview", position: [radius * 0.8, radius * 1.4, radius * 1.5], target: [0, 0, 0] },
    {
      name: "edge",
      position: [radius + 60, terrain.heightAt([radius, 0]) + 60, 90],
      target: [radius, terrain.heightAt([radius, 0]), 0]
    }
  ];
  const chunkSizes = [64, 128, 256].map(meters => {
    const chunks = new Map<string, { box: THREE.Box3; count: number }>();
    for (const point of points.values()) {
      const key = `${Math.floor(point[0] / meters)},${Math.floor(point[1] / meters)}`;
      let chunk = chunks.get(key);
      if (!chunk) {
        chunk = { box: new THREE.Box3(), count: 0 };
        chunks.set(key, chunk);
      }
      const y = terrain.heightAt(point);
      chunk.box.expandByPoint(new THREE.Vector3(point[0] - 4, y, -point[1] - 4));
      chunk.box.expandByPoint(new THREE.Vector3(point[0] + 4, y + 12, -point[1] + 4));
      chunk.count++;
    }
    return {
      meters,
      totalChunks: chunks.size,
      poses: poses.map(pose => {
        const camera = new THREE.PerspectiveCamera(45, 1000 / 720, 0.5, 80000);
        camera.position.fromArray(pose.position);
        camera.lookAt(new THREE.Vector3().fromArray(pose.target));
        camera.updateMatrixWorld(true);
        const frustum = new THREE.Frustum().setFromProjectionMatrix(
          new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
        );
        const visible = [...chunks.values()].filter(chunk => frustum.intersectsBox(chunk.box));
        return {
          pose: pose.name,
          visibleChunks: visible.length,
          submittedInstances: visible.reduce((sum, chunk) => sum + chunk.count, 0),
          oneSpeciesTwoMaterialDrawCalls: visible.length * 2
        };
      })
    };
  });
  return { id: row.fixture.id, samples: points.size, edgeSamples: row.sampling.edge, chunkSizes };
});
writeFileSync(
  "docs/analytics/ce-forest-f0/chunk-analysis.json",
  JSON.stringify(
    {
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      method:
        "AABB/frustum intersection of actual 8 m farm-derived samples; 12 m crown height; one tree species, two materials. Structural counts only; no GPU timing, occlusion or LOD. Terrain is sampled per point. Same first poses as real CE benchmark.",
      results
    },
    null,
    2
  ) + "\n"
);
console.log(JSON.stringify(results));
