import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createFriary } from "../../buildings/monasteries/friary";
import type { Monastery } from "../../city-editor/generators/monasteryLayout";
import type { CityTerrain } from "../../city-editor/generators/terrainElevation";
import type { CityStructureMeshes } from "./structureMeshes";

/** Merge solid-color BV parts into one vertex-colored city mesh, retaining the fitted CE geometry. */
export function createTownFriaries(
  monasteries: readonly Monastery[],
  terrain?: Pick<CityTerrain, "foundationAt" | "heightAt">
): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "ce-friaries";
  const parts: THREE.BufferGeometry[] = [];
  for (const monastery of monasteries) {
    if (monastery.kind !== "friary") continue;
    const elevation = terrain?.foundationAt(monastery.precinct) ?? 0;
    const low = terrain ? Math.min(...monastery.precinct.map(terrain.heightAt)) : elevation;
    const model = createFriary(monastery, elevation, low < elevation - 0.1 ? low - 0.2 : elevation);
    model.group.updateMatrixWorld(true);
    for (const mesh of model.pickables) {
      const transformed = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
      if (geometry !== transformed) transformed.dispose();
      const material = mesh.material as THREE.MeshLambertMaterial;
      if (!geometry.getAttribute("color")) {
        const colors = new Float32Array(geometry.getAttribute("position").count * 3);
        for (let i = 0; i < colors.length; i += 3) material.color.toArray(colors, i);
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      }
      for (const attribute of Object.keys(geometry.attributes))
        if (!["position", "normal", "color"].includes(attribute)) geometry.deleteAttribute(attribute);
      parts.push(geometry);
    }
    model.dispose();
  }
  const pickables: THREE.Mesh[] = [];
  if (parts.length) {
    const geometry = mergeGeometries(parts)!;
    for (const part of parts) part.dispose();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "friary-assembly";
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
