import * as THREE from "three";
import { expect, it } from "vitest";
import { createLandscapeTree } from "../../buildings/landscape/trees";
import { createForestTreeDetails, type ForestTreeSite } from "./forestTreeDetails";

it("prioritizes an on-screen crown over a closer off-screen tree and restores its base instance", () => {
  const parent = new THREE.Group(),
    details = createForestTreeDetails(parent);
  const geometry = new THREE.BoxGeometry(1, 10, 1),
    material = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 2);
  parent.add(mesh);
  const matrices = [
    new THREE.Matrix4().makeScale(3, 1, 3).setPosition(5, 0, 26),
    new THREE.Matrix4().makeScale(3, 1, 3)
  ];
  matrices.forEach((m, i) => {
    mesh.setMatrixAt(i, m);
  });
  const sites: ForestTreeSite[] = matrices.map((m, index) => ({
    id: String(index),
    point: [m.elements[12], -m.elements[14]],
    radius: 3,
    size: 1,
    species: "garden_parkland",
    mesh,
    index
  }));
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(0, 7, 30);
  camera.lookAt(0, 7, 0);
  camera.updateMatrixWorld(true);
  const source = createLandscapeTree("garden_parkland");
  let triangles = 0;
  source.group.traverse(o => {
    if (o instanceof THREE.Mesh)
      triangles += (o.geometry.index?.count ?? o.geometry.getAttribute("position").count) / 3;
  });
  source.dispose();
  const result = details.update(camera, 720, sites, { triangles, calls: 2, shadowTriangles: 0 });
  expect(result.trees).toBe(1);
  const first = new THREE.Matrix4(),
    second = new THREE.Matrix4();
  mesh.getMatrixAt(0, first);
  mesh.getMatrixAt(1, second);
  expect(first.elements).toEqual(matrices[0].elements);
  expect(new THREE.Vector3().setFromMatrixScale(second).length()).toBe(0);
  details.reset();
  mesh.getMatrixAt(1, second);
  expect(second.elements).toEqual(matrices[1].elements);
  details.dispose();
  geometry.dispose();
  material.dispose();
  mesh.dispose();
});

it("grows full-detail instance buffers without losing transforms or leaking shared geometry", () => {
  const group = new THREE.Group();
  const details = createForestTreeDetails(group);
  const geometry = new THREE.BoxGeometry(1, 10, 1);
  const material = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 40);
  const sites: ForestTreeSite[] = Array.from({ length: 40 }, (_, index) => {
    mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(index * 0.1, 0, 0));
    return { id: String(index), point: [index * 0.1, 0], radius: 3, size: 1, species: "garden_parkland", mesh, index };
  });
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20000);
  camera.position.set(0, 10000, 1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const budget = { triangles: Infinity, calls: Infinity, shadowTriangles: Infinity };
  expect(details.update(camera, 720, sites.slice(0, 20), budget, false).trees).toBe(20);
  const old = group.getObjectByName("forest-bv-garden_parkland-shadow") as THREE.InstancedMesh;
  let freed = 0;
  old.geometry.addEventListener("dispose", () => freed++);
  details.reset();
  expect(details.update(camera, 720, sites, budget, false).trees).toBe(40);
  const grown = group.getObjectByName("forest-bv-garden_parkland-shadow") as THREE.InstancedMesh;
  expect(grown).not.toBe(old);
  expect(grown.geometry).toBe(old.geometry);
  expect(grown.count).toBe(40);
  expect(grown.instanceMatrix.count).toBeGreaterThanOrEqual(40);
  expect(freed).toBe(0);
  details.reset();
  const restored = new THREE.Matrix4();
  mesh.getMatrixAt(39, restored);
  expect(restored.elements[12]).toBeCloseTo(3.9);
  details.dispose();
  details.dispose();
  expect(freed).toBe(1);
  geometry.dispose();
  material.dispose();
  mesh.dispose();
});
