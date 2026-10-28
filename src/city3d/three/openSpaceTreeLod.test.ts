import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedTree, sceneVariants } from "../adoption";
import { createTownOpenSpaces } from "./openSpaceMeshes";

function camera() {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
  camera.position.set(0, 6, 0);
  camera.lookAt(0, 6, -1);
  return camera;
}
function trees(group: THREE.Group) {
  const counts = new Map<string, number>();
  group.traverseVisible(object => {
    if (object instanceof THREE.InstancedMesh && object.count)
      counts.set(object.userData.treeQuality, (counts.get(object.userData.treeQuality) ?? 0) + object.count);
  });
  return counts;
}

it("draws four camera-distance tiers together, culls off-screen trees and switches on camera movement without rebuilding surfaces", () => {
  const model = createTownOpenSpaces(
    {
      surfaces: [],
      sites: [30, 100, 300, 1000, -100].map(distance => ({
        model: "garden_parkland",
        point: [0, distance],
        radius: 4,
        angle: 0
      }))
    },
    undefined,
    "lime"
  );
  const c = camera();
  model.update(c, 720);
  expect([...trees(model.group).entries()].sort()).toEqual([
    ["high", 1],
    ["low", 1],
    ["medium", 1],
    ["ultra", 1]
  ]);
  expect(sceneVariants(model.group)).toEqual(
    ["low", "medium", "high", "ultra"].map(quality => adoptedTree("garden_parkland", quality).id).sort()
  );
  const residentGroups = [...model.group.children];
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  model.group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        resources.add(material);
    }
  });
  const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  expect(model.update(c, 720)).toBe(false);
  c.zoom = 4;
  c.updateProjectionMatrix();
  model.update(c, 720);
  expect(trees(model.group).get("low")).toBe(1);
  c.position.z = 70;
  model.update(c, 720);
  expect(trees(model.group).get("ultra") ?? 0).toBe(0);
  expect(trees(model.group).get("medium")).toBe(2);
  expect(model.group.children).toEqual(residentGroups);
  c.lookAt(0, 6, c.position.z + 1);
  model.update(c, 720);
  expect([...trees(model.group).values()].reduce((a, b) => a + b, 0)).toBe(1);
  model.dispose();
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
});
