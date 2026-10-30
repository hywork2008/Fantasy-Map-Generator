import * as THREE from "three";

/** Owned world-space triangles for one tagged structure, including caps in other batches. */
export function structureSelectionGeometry(
  meshes: readonly THREE.Mesh[],
  index: number
): THREE.BufferGeometry | undefined {
  if (!Number.isInteger(index) || index < 0) return;
  const positions: number[] = [];
  const vertex = new THREE.Vector3();
  for (const mesh of meshes) {
    const source = mesh.geometry;
    const tags = source.getAttribute("buildingIndex");
    const points = source.getAttribute("position");
    if (!tags || !points) continue;
    mesh.updateWorldMatrix(true, false);
    const count = source.index?.count ?? points.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const a = source.index?.getX(i) ?? i;
      if (tags.getX(a) !== index) continue;
      for (let j = 0; j < 3; j++) {
        const id = source.index?.getX(i + j) ?? i + j;
        vertex.fromBufferAttribute(points, id).applyMatrix4(mesh.matrixWorld);
        positions.push(vertex.x, vertex.y, vertex.z);
      }
    }
  }
  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingBox();
  return geometry;
}
