import * as THREE from "three";
import { expect, it } from "vitest";
import { collectModelMetrics } from "./modelMetrics";

it("counts shared geometry once but triangles per rendered instance, respecting draw ranges", () => {
  const root = new THREE.Group();
  const shared = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const a = new THREE.Mesh(shared, material);
  const b = new THREE.InstancedMesh(shared, material, 4);
  const unindexed = new THREE.BufferGeometry();
  unindexed.setAttribute("position", new THREE.Float32BufferAttribute(new Array(18).fill(0), 3));
  unindexed.setDrawRange(3, 3);
  const secondMaterial = new THREE.MeshBasicMaterial();
  root.add(a, b, new THREE.Mesh(unindexed, [material, secondMaterial]));
  expect(collectModelMetrics(root)).toEqual({
    meshes: 3,
    triangles: 12 * 5 + 1,
    vertices: shared.getAttribute("position").count + 6,
    geometries: 2,
    materials: 2
  });
  shared.dispose();
  unindexed.dispose();
  material.dispose();
  secondMaterial.dispose();
});
