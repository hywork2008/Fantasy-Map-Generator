import * as THREE from "three";
import { expect } from "vitest";
import { checkLandmark, heightAt } from "./landmarkTestSupport";
import { model } from "./towerOfBabel";

checkLandmark(model, assembly => {
  // Check actual world geometry: upper tiers must retain their own width and
  // elevation, rather than inheriting the base footprint or starting at ground.
  expect(assembly.pickables).toHaveLength(14);
  const tiers = assembly.pickables.map(mesh => new THREE.Box3().setFromObject(mesh));
  expect(tiers[0].getSize(new THREE.Vector3()).x).toBeCloseTo(100);
  expect(tiers[6].getSize(new THREE.Vector3()).x).toBeCloseTo(63);
  expect(tiers[13].getSize(new THREE.Vector3()).x).toBeCloseTo(24);
  for (let i = 1; i < tiers.length; i++) {
    expect(tiers[i].min.y).toBeCloseTo(tiers[i - 1].max.y);
    expect(tiers[i].max.x).toBeLessThan(tiers[i - 1].max.x);
    expect(tiers[i].min.x).toBeGreaterThan(tiers[i - 1].min.x);
  }
  expect(heightAt(assembly, 0, 0)).toBeCloseTo(106);
  expect(heightAt(assembly, 49, 0)).toBeCloseTo(10);
  expect(heightAt(assembly, 30, 0)).toBeCloseTo(65);
  expect(heightAt(assembly, 12.5, 0)).toBeCloseTo(102);
  // Only centered main-body tiers are allowed; no external small towers.
  for (const mesh of assembly.pickables) {
    expect(mesh.position.x).toBe(0);
    expect(mesh.position.z).toBe(0);
  }
});
