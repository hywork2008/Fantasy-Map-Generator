import * as THREE from "three";
import type { CityStructureMeshes } from "../city3d/three/structureMeshes";

/** Orthographic drawings from the actual mesh faces keep both views aligned with the model. */
export function meshProjection(model: CityStructureMeshes, view: "side" | "top"): string {
  model.group.updateMatrixWorld(true);
  const faces: { depth: number; path: string }[] = [];
  const bounds = new THREE.Box3().setFromObject(model.group);
  const point = (p: THREE.Vector3) => `${p.x.toFixed(3)},${(view === "side" ? -p.y : p.z).toFixed(3)}`;
  for (const mesh of model.pickables) {
    const positions = mesh.geometry.getAttribute("position"),
      indices = mesh.geometry.index;
    const count = indices?.count ?? positions.count;
    const material = mesh.material as THREE.MeshLambertMaterial;
    for (let i = 0; i < count; i += 3) {
      const points = [0, 1, 2].map(j =>
        new THREE.Vector3()
          .fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j)
          .applyMatrix4(mesh.matrixWorld)
      );
      const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
      if ((view === "side" ? normal.z : normal.y) <= 0.001) continue;
      const color = material.color.clone().multiplyScalar(0.8 + 0.2 * Math.max(0, normal.y));
      const vertexColors = mesh.geometry.getAttribute("color");
      if (material.vertexColors && vertexColors) {
        const vertexColor = new THREE.Color(0, 0, 0);
        for (let j = 0; j < 3; j++) {
          const k = indices ? indices.getX(i + j) : i + j;
          vertexColor.r += vertexColors.getX(k) / 3;
          vertexColor.g += vertexColors.getY(k) / 3;
          vertexColor.b += vertexColors.getZ(k) / 3;
        }
        color.multiply(vertexColor);
      }
      const fill = `#${color.getHexString()}`;
      faces.push({
        depth: points.reduce((sum, p) => sum + (view === "side" ? p.z : p.y), 0) / 3,
        path: `<path d="M${points.map(point).join(" L")} Z" fill="${fill}" stroke="${fill}" stroke-width="0.008"/>`
      });
    }
  }
  const minY = view === "side" ? -bounds.max.y : bounds.min.z;
  const height = view === "side" ? bounds.max.y - bounds.min.y : bounds.max.z - bounds.min.z;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.min.x - 0.5} ${minY - 0.5} ${bounds.max.x - bounds.min.x + 1} ${height + 1}">${faces
    .sort((a, b) => a.depth - b.depth)
    .map(face => face.path)
    .join("")}</svg>`;
}
