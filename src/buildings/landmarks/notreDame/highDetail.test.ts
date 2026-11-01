import * as THREE from "three";
import { expect } from "vitest";
import { checkLandmark, heightAt } from "../landmarkTestSupport";
import { model } from "./highDetail";

checkLandmark(model, assembly => {
  expect(heightAt(assembly, -54.5, -21.9)).toBeCloseTo(69, 1);
  expect(heightAt(assembly, -54.5, 21.9)).toBeCloseTo(69, 1);
  expect(heightAt(assembly, 3, 0)).toBeCloseTo(96, 1);
  expect(heightAt(assembly, -27, 0)).toBeGreaterThan(heightAt(assembly, -27, 15) + 25);

  const westRay = (y: number, z: number) =>
    new THREE.Raycaster(new THREE.Vector3(-80, y, z), new THREE.Vector3(1, 0, 0)).intersectObjects(assembly.pickables);
  // The tall belfry bays must remain real voids after batching, with a solid central pier.
  expect(westRay(57, -17.7)).toHaveLength(0);
  expect(westRay(57, -14).length).toBeGreaterThan(0);
  // All three doors sit behind the front wall, within the modeled portal recesses.
  for (const z of [-12, 2, 16]) {
    const door = westRay(4, z)[0];
    expect((door.object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>).material.color.getHex()).toBe(
      0x795036
    );
    expect(door.point.x).toBeGreaterThan(-62);
  }
  const counts = new Map<string, number>();
  for (const part of model.parts!()) {
    const source = part.create();
    try {
      for (const mesh of source.pickables)
        counts.set(mesh.name, (counts.get(mesh.name) ?? 0) + (mesh.userData.instances ?? 1));
    } finally {
      source.dispose();
    }
  }
  const count = (name: string) => counts.get(name) ?? 0;
  expect(count("king-crown")).toBe(28);
  expect(count("rose-glass")).toBeGreaterThanOrEqual(3);
  expect(count("flying-buttress")).toBe(25);
  expect(count("spire-copper-figure-head")).toBe(16);
  // Prevent accidental removal of batching when adding high-detail ornament.
  expect(assembly.pickables.length).toBeLessThan(180);
});
