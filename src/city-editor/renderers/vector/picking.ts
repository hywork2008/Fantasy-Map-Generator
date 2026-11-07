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
