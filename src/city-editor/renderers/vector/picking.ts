import type * as THREE from "three";
/** The scene's stable logical owner wins over BV's internal part names. */
export function vectorPickOwner(object: THREE.Object3D): string | null {
  let owner: string | null = null;
  for (let current: THREE.Object3D | null = object; current; current = current.parent)
    if (
      typeof current.userData.id === "string" &&
      ["region", "block", "junction", "road", "river", "wall", "bridge", "access", "building", "feature"].includes(
        current.userData.kind
      )
    )
      owner = current.userData.id;
  return owner;
}

/** Generated house hit in a batched house mesh: triangle ranges map back to logical house ids. */
export function vectorPickHouse(
  object: THREE.Object3D,
  faceIndex: number | null | undefined
): { id: string; firstTriangle: number; endTriangle: number } | null {
  const table = object.userData.fabricHouses as
    | { ids: string[]; firstTriangles: number[]; triangles: number }
    | undefined;
  if (!table?.ids.length || faceIndex === null || faceIndex === undefined || faceIndex < 0) return null;
  // A massing whose detailed houses are hidden draws through an index of the kept triangles (LOD).
  const index = (object as THREE.Mesh).geometry?.index;
  if (index && table.ids.length) faceIndex = Math.floor(index.getX(faceIndex * 3) / 3);
  const starts = table.firstTriangles;
  let low = 0,
    high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= faceIndex) low = mid;
    else high = mid - 1;
  }
  return {
    id: table.ids[low],
    firstTriangle: starts[low],
    endTriangle: low + 1 < starts.length ? starts[low + 1] : table.triangles
  };
}
