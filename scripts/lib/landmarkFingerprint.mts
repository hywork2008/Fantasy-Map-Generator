import { createHash } from "node:crypto";
import * as THREE from "three";

// Ignore mesh order and batching, retaining triangle winding, normals and material settings.
export function landmarkFingerprint(root: THREE.Object3D) {
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

