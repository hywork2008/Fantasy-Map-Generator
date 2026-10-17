import * as THREE from "three";
import type { BuildingMassing } from "../../city-editor/types/contracts/buildingMassing";
import type { Point } from "../../city-editor/types/primitives";
import { buildingSurfaces, type TriangleSoup } from "../core/massingGeometry";
import { ROOF_COLOR, tinted, WALL_COLOR } from "./palette";

export interface CityMassingMeshes {
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

/** One wall mesh and one roof mesh for every lot that has massing. `buildingIndex` matches the input array. */
export function createCityMassing(lots: readonly { polygon: Point[]; massing?: BuildingMassing }[]): CityMassingMeshes {
  const walls: Parts = { positions: [], normals: [], colors: [], buildingIndex: [] };
  const roofs: Parts = { positions: [], normals: [], colors: [], buildingIndex: [] };
  for (let index = 0; index < lots.length; index++) {
    const massing = lots[index].massing;
    if (!massing) continue;
    const surfaces = buildingSurfaces(lots[index].polygon, massing);
    if (!surfaces) continue;
    append(walls, surfaces.walls, tinted(WALL_COLOR[massing.wall], massing.tint), index);
    append(roofs, surfaces.roofs, tinted(ROOF_COLOR[massing.roof.material], massing.tint), index);
  }
  const group = new THREE.Group();
  group.name = "massing";
  const pickables: THREE.Mesh[] = [];
  for (const parts of [walls, roofs]) {
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
