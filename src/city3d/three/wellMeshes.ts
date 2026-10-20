import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createMedievalWellModel } from "../../buildings/wells/medievalWell";
import type { Point } from "../../city-editor/types/primitives";
import { planVertex } from "../core/planFrame";
import type { CityStructureMeshes } from "./structureMeshes";

export interface WellSite {
  id: string;
  point: Point;
}

/** Batch the BV model by material and share it across all city wells. */
export function createTownWells(sites: readonly WellSite[], heightAt?: (point: Point) => number): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "ce-wells";
  const pickables: THREE.Mesh[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  if (!sites.length) return { group, pickables, dispose() {} };
  const model = createMedievalWellModel();
  model.group.updateMatrixWorld(true);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const mesh of model.pickables) {
    const surface = mesh.material as THREE.Material;
    const parts = batches.get(surface) ?? [];
    const transformed = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
    if (geometry !== transformed) transformed.dispose();
    parts.push(geometry);
    batches.set(surface, parts);
  }
  const matrix = new THREE.Matrix4();
  for (const [surface, parts] of batches) {
    const geometry = mergeGeometries(parts)!;
    for (const part of parts) part.dispose();
    geometries.push(geometry);
    const mesh = new THREE.InstancedMesh(geometry, surface, sites.length);
    mesh.name = "well-instances";
    sites.forEach((site, i) => {
      matrix.makeTranslation(...planVertex(site.point, heightAt?.(site.point) ?? 0));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    pickables.push(mesh);
  }
  return {
    group,
    pickables,
    dispose() {
      for (const mesh of pickables) (mesh as THREE.InstancedMesh).dispose();
      for (const geometry of geometries) geometry.dispose();
      model.dispose();
    }
  };
}
