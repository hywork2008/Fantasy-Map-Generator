import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createTownOpenSpaces } from "../../city3d/three/openSpaceMeshes";
import { createSmallLeavedLime } from "./smallLeavedLime";

it("builds a grounded, deterministic tree with independently owned resources", () => {
  const a = createSmallLeavedLime(),
    b = createSmallLeavedLime();
  const bounds = new THREE.Box3().setFromObject(a.group);
  expect(bounds.min.y).toBeCloseTo(0, 2);
  expect(bounds.max.y).toBeGreaterThan(10);
  expect(bounds.max.y).toBeLessThan(13);
  expect(bounds.max.x - bounds.min.x).toBeGreaterThan(8);
  a.pickables.forEach((mesh, i) => {
    expect(mesh.geometry).not.toBe(b.pickables[i].geometry);
    expect(mesh.geometry.getAttribute("position").array).toEqual(
      b.pickables[i].geometry.getAttribute("position").array
    );
  });
  const resources = a.pickables.flatMap(mesh => [mesh.geometry, mesh.material as THREE.Material]);
  const spies = resources.map(resource => vi.spyOn(resource, "dispose"));
  a.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  b.dispose();
});

it("retains foliage colors when CE batches park trees into instances", () => {
  const model = createTownOpenSpaces({
    surfaces: [],
    sites: [
      { model: "garden_parkland", point: [0, 0], radius: 3, angle: 0 },
      { model: "garden_parkland", point: [10, 0], radius: 4, angle: 1 }
    ]
  });
  expect(model.pickables).toHaveLength(2);
  const foliage = model.pickables.find(mesh => (mesh.material as THREE.MeshLambertMaterial).vertexColors)!;
  expect(foliage.geometry.getAttribute("color").count).toBe(foliage.geometry.getAttribute("position").count);
  expect((foliage as THREE.InstancedMesh).count).toBe(2);
  model.dispose();
});

it("covers the leader with a leafy upper crown instead of a hollow canopy ring", () => {
  const model = createSmallLeavedLime();
  model.group.updateMatrixWorld(true);
  const crown = model.pickables.find(mesh => mesh.name === "lime-heart-shaped-leaves")!;
  for (const [x, z] of [
    [0, 0],
    [0.5, 0],
    [-0.5, 0],
    [0, 0.5],
    [0, -0.5]
  ]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 15, z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(crown);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].point.y).toBeGreaterThan(9);
  }
  model.dispose();
});
