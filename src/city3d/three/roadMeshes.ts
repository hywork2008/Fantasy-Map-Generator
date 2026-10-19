// CE 3D wearing-course meshes. WebGL is created by the view, not here.

import * as THREE from "three";
import type { Point } from "../../city-editor/types/primitives";
import type { RoadRibbon } from "../../utils/roadSurface";
import { type RoadWaterCut, roadSurfaceSoups } from "../core/roadGeometry";

export interface TownRoadMeshes {
  parent: THREE.Object3D;
  dispose(): void;
}

/** Parent absence counts. Missing ce-road-* children do not. */
export function roadStampChanged(previous: string | null, next: string, parentPresent: boolean): boolean {
  return previous !== next || !parentPresent;
}

/** One Lambert mesh per surface. Roads are not pickable. */
export function createTownRoads(
  ribbons: readonly RoadRibbon[],
  water: RoadWaterCut,
  heightAt?: (point: Point) => number
): TownRoadMeshes {
  const parent = new THREE.Object3D();
  parent.name = "ce-roads";
  const owned: THREE.Mesh[] = [];
  for (const part of roadSurfaceSoups(ribbons, water)) {
    if (heightAt)
      for (let i = 0; i < part.soup.positions.length; i += 3)
        part.soup.positions[i + 1] += heightAt([part.soup.positions[i], -part.soup.positions[i + 2]]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(part.soup.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(part.soup.normals, 3));
    if (heightAt) geometry.computeVertexNormals();
    geometry.setAttribute("color", new THREE.BufferAttribute(part.soup.colors, 3));
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        color: 0xffffff,
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })
    );
    mesh.name = `ce-road-${part.surface}`;
    mesh.raycast = () => {};
    parent.add(mesh);
    owned.push(mesh);
  }
  return {
    parent,
    dispose() {
      parent.removeFromParent();
      for (const mesh of owned) {
        mesh.geometry.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) for (const item of material) item.dispose();
        else material.dispose();
      }
    }
  };
}
