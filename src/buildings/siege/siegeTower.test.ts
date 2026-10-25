import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createSiegeTower, SIEGE_TOWER } from "./siegeTower";

it("grounds four wheels and provides a continuous bridge with paired hoist ropes", () => {
  const model = createSiegeTower();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.max.y).toBeLessThanOrEqual(SIEGE_TOWER.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(SIEGE_TOWER.length);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(SIEGE_TOWER.width);
  const parts = (name: string) => model.pickables.filter(mesh => mesh.name === name);
  expect(parts("wheel-iron-tire")).toHaveLength(4);
  for (const wheel of parts("wheel-iron-tire")) expect(new THREE.Box3().setFromObject(wheel).min.y).toBeCloseTo(0);
  expect(parts("bridge-hoist-rope")).toHaveLength(2);
  const bridge = new THREE.Box3();
  for (const plank of parts("bridge-plank")) bridge.union(new THREE.Box3().setFromObject(plank));
  expect(bridge.min.x).toBeCloseTo(parts("bridge-hinge")[0].position.x + 0.005);
  expect(bridge.min.y).toBeCloseTo(7.4);
  expect(parts("ladder-stile")).toHaveLength(4);
  // Each upper ladder emerges through the omitted rear-left deck segment.
  for (const y of [4.55, 7.45]) {
    const hatch = new THREE.Vector3(-1.55, y, -1.1);
    expect(parts("floor-plank").some(mesh => new THREE.Box3().setFromObject(mesh).containsPoint(hatch))).toBe(false);
  }
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.plan).toContain("<path");
  expect(model.elevation).not.toBe(model.plan);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const mesh of model.pickables) {
    resources.add(mesh.geometry);
    for (const material of [mesh.material].flat()) resources.add(material);
  }
  const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
});
