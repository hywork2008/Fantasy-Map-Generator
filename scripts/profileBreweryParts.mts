import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { collectModelMetrics } from "../src/building-viewer/modelMetrics";
import { modelParts } from "../src/buildings/modelParts";
import { models } from "../src/buildings/medieval/15-breweriesModels";
import type { CityStructureMeshes } from "../src/city3d/three/structureMeshes";

// Low retains the original baseline; High includes the shared closed Storage casks.
const baseline = {
  "town-brewery/low": "3c52f2dd0bca2e7c345439d6997934c1a279f38eed73453d7acc9b29c4e5e009",
  "town-brewery/high": "3f7f87924b0755db84b5007188bd1b2a41d699f386e2171cad2ffc4d20ef0005",
  "ale-brewhouse/low": "6e66eb2b9bf9e957c69e2316457572adc198df71295474d093c36537c98bb5a9",
  "ale-brewhouse/high": "7bda520aa736b2889d208e9cedf95d697b97941a2afd9405b2cc9ac19e1ee247"
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

const beforeReuse = JSON.parse(await readFile("docs/analytics/bv-brewery-before-shared-casks-20261101.json", "utf8"));
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
      components.push({ id: part.id, role: part.role, quality: part.quality, sha256: digest(solo), metrics: collectModelMetrics(solo.group) });
      solo.dispose();
    }
    const before = beforeReuse.rows.find((row: { id: string; quality: string }) => row.id === definition.id && row.quality === variant.level);
    const nonCaskGeometryMatches = components.filter(part => part.role !== "casks").every(part => part.sha256 === before.components.find((old: { role: string }) => old.role === part.role).sha256);
    rows.push({ id: definition.id, quality: variant.level, standard, compositions, components, nonCaskGeometryMatches });
  }
}
const output = process.argv[2] ?? "docs/analytics/bv-brewery-parts-p3-20261101.json";
await writeFile(output, JSON.stringify({
  runtime: process.version,
  method: "SHA-256 over sorted triangle strings: material color hex and side, then oriented world vertices rounded to 5 decimals. Normals, mesh names and resource identity are excluded. Low baseline predates extraction; High baseline includes shared Storage casks. The split-only beforeReuse record preserves the original full-model hashes; non-cask component geometry is compared against that snapshot. Every registered model, composition and single component is independently built, counted and disposed. Source-part mesh counts in ledgers precede final material batching.",
  rows
}, null, 2) + "\n");
console.log(rows.map(row => ({ id: row.id, quality: row.quality, matchesBaseline: row.standard.matchesBaseline, metrics: row.standard.metrics, nonCaskGeometryMatches: row.nonCaskGeometryMatches })));
if (rows.some(row => !row.standard.matchesBaseline || !row.nonCaskGeometryMatches)) process.exitCode = 1;
