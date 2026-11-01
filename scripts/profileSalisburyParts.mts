import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import * as THREE from "three";
import { collectModelMetrics } from "../src/building-viewer/modelMetrics";
import { model } from "../src/buildings/landmarks/salisbury";
import { modelParts } from "../src/buildings/modelParts";

// Ignore mesh order and batching, retaining triangle winding, normals and material settings.
function fingerprint(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const triangles: string[] = [];
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    const position = g.getAttribute("position"), normal = g.getAttribute("normal");
    const { uuid, ...material } = (mesh.material as THREE.Material).toJSON();
    const surface = JSON.stringify(material);
    for (let start = 0; start < position.count; start += 3) {
      const values: number[] = [];
      for (let i = start; i < start + 3; i++) {
        for (const attribute of [position, normal]) {
          values.push(...[attribute.getX(i), attribute.getY(i), attribute.getZ(i)].map(v => Math.round(v * 1e5)));
        }
      }
      triangles.push(`${surface}:${values.join(",")}`);
    }
    g.dispose();
  });
  return createHash("sha256").update(triangles.sort().join("\n")).digest("hex");
}

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
  const otherParts = definition.parts?.().filter(part => part.role !== "chapter-house");
  const remainder = otherParts ? definition.assembleParts!(otherParts) : undefined;
  const unchangedArchitectureFingerprint = remainder ? fingerprint(remainder.group) : undefined;
  remainder?.dispose();
  rows.push({ quality, metrics: collectModelMetrics(assembly.group), unchangedArchitectureFingerprint,
    attributeBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0),
    dimensions: new THREE.Box3().setFromObject(assembly.group).getSize(new THREE.Vector3()).toArray(),
    fingerprint: fingerprint(assembly.group), sourceParts: modelParts(assembly.group), parts });
  assembly.dispose();
}
const output = process.argv[2] ?? "docs/analytics/bv-salisbury-chapter-high-20261101.json";
await writeFile(output, JSON.stringify({ method: "World-space triangles and normals rounded to 1e-5, with winding and material settings, sorted independently of batching. Buffer bytes count unique CPU ArrayBuffers only; no GPU/FPS benchmark.", rows }, null, 2) + "\n");
console.log(rows.map(({ quality, metrics, attributeBytes, fingerprint }) => ({ quality, metrics, attributeBytes, fingerprint })));
