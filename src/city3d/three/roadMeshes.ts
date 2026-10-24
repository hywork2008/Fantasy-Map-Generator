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

/** One Lambert mesh per surface. Roads are not pickable. `groundAt` adds a skirt where the ribbon leaves the ground. */
export function createTownRoads(
  ribbons: readonly RoadRibbon[],
  water: RoadWaterCut,
  heightAt?: (point: Point) => number,
  groundAt?: (point: Point) => number
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
  if (heightAt && groundAt) {
    const skirt = roadSkirt(ribbons, heightAt, groundAt);
    if (skirt) {
      parent.add(skirt);
      owned.push(skirt);
    }
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

const SKIRT_GAP_METERS = 0.3;

/** Quads from a ribbon edge down or up to the ground, where the seam would show. */
function roadSkirt(
  ribbons: readonly RoadRibbon[],
  roadAt: (point: Point) => number,
  groundAt: (point: Point) => number
): THREE.Mesh | null {
  const positions: number[] = [];
  const push = (point: Point, y: number) => positions.push(point[0], y, -point[1]);
  for (const ribbon of ribbons) {
    const line = ribbon.centerline;
    const half = ribbon.widthMeters / 2;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      for (const side of [1, -1]) {
        const aEdge: Point = [a[0] + nx * half * side, a[1] + ny * half * side];
        const bEdge: Point = [b[0] + nx * half * side, b[1] + ny * half * side];
        const roadA = roadAt(aEdge);
        const roadB = roadAt(bEdge);
        const groundA = groundAt(aEdge);
        const groundB = groundAt(bEdge);
        if (Math.max(Math.abs(roadA - groundA), Math.abs(roadB - groundB)) <= SKIRT_GAP_METERS) continue;
        push(aEdge, roadA);
        push(bEdge, roadB);
        push(aEdge, groundA);
        push(bEdge, roadB);
        push(bEdge, groundB);
        push(aEdge, groundA);
      }
    }
  }
  if (positions.length < 9) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(positions), 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: 0xc4b8a4, side: THREE.DoubleSide }));
  mesh.name = "ce-road-skirt";
  mesh.raycast = () => {};
  return mesh;
}
