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
