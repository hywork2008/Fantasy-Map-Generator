import * as THREE from "three";
import type { StructureMassing, StructureMaterial } from "../../city-editor/types/contracts/structureMassing";
import { structureSurfaces, type TriangleSoup } from "../core/structureGeometry";

const BODY: Record<StructureMaterial, readonly [number, number, number]> = {
  stone: [0.48, 0.46, 0.42],
  wood: [0.45, 0.3, 0.18]
};
const CAP: Record<StructureMaterial, readonly [number, number, number]> = {
  stone: [0.62, 0.6, 0.55],
  wood: [0.58, 0.4, 0.24]
};
const DECK: readonly [number, number, number] = [0.74, 0.7, 0.6];
const RAIL: readonly [number, number, number] = [0.34, 0.32, 0.3];

export interface CityStructureMeshes {
  group: THREE.Group;
  pickables: THREE.Mesh[];
  dispose(): void;
}

interface Parts {
  positions: number[];
  normals: number[];
  colors: number[];
  buildingIndex: number[];
}

function append(parts: Parts, soup: TriangleSoup, color: readonly [number, number, number], index: number): void {
  if (!soup.positions.length) return;
  parts.positions.push(...soup.positions);
  parts.normals.push(...soup.normals);
  const vertices = soup.positions.length / 3;
  for (let i = 0; i < vertices; i++) {
    parts.colors.push(color[0], color[1], color[2]);
    parts.buildingIndex.push(index);
  }
}

function meshFrom(parts: Parts): THREE.Mesh | null {
  if (!parts.positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(parts.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(parts.normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(parts.colors, 3));
  geometry.setAttribute("buildingIndex", new THREE.Float32BufferAttribute(parts.buildingIndex, 1));
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/** One body mesh and one cap mesh. `buildingIndex` matches the input array. */
export function createStructureMassing(structures: readonly StructureMassing[]): CityStructureMeshes {
  const body: Parts = { positions: [], normals: [], colors: [], buildingIndex: [] };
  const caps: Parts = { positions: [], normals: [], colors: [], buildingIndex: [] };
  structures.forEach((structure, index) => {
    const surfaces = structureSurfaces(structure);
    if (!surfaces) return;
    const deck = structure.kind === "bridge";
    append(body, surfaces.walls, deck ? DECK : BODY[structure.material], index);
    append(caps, surfaces.roofs, deck ? RAIL : CAP[structure.material], index);
  });
  const group = new THREE.Group();
  group.name = "structures";
  const pickables: THREE.Mesh[] = [];
  for (const parts of [body, caps]) {
    const mesh = meshFrom(parts);
    if (!mesh) continue;
    group.add(mesh);
    pickables.push(mesh);
  }
  return {
    group,
    pickables,
    dispose() {
      for (const mesh of pickables) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  };
}
