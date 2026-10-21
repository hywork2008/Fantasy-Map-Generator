import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  CONTAINER_KINDS,
  CONTAINER_STATES,
  createMedievalContainer,
  createMedievalContainerModel,
  MEDIEVAL_CONTAINERS
} from "./medievalContainers";

describe.each(CONTAINER_KINDS)("medieval %s", kind => {
  it.each(CONTAINER_STATES)("grounds the %s variant within its meter envelope and produces finite drawings", state => {
    const model = createMedievalContainer(kind, state);
    const spec = MEDIEVAL_CONTAINERS[kind];
    const bounds = new THREE.Box3().setFromObject(model.group);
    const size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(0, 6);
    expect(size.x).toBeLessThanOrEqual(spec.width);
    expect(size.z).toBeLessThanOrEqual(spec.depth);
    expect(size.y).toBeLessThanOrEqual(spec.height);
    for (const mesh of model.pickables) {
      expect(Array.from(mesh.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
    }
    expect(model.elevation).toContain("<path");
    expect(model.plan).toContain("<path");
    expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
    model.dispose();
  });

  it("has an open empty interior and visibly closes or fills the mouth in other states", () => {
    const height: number[] = [];
    for (const state of CONTAINER_STATES) {
      const model = createMedievalContainerModel(kind, state);
      model.group.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(0.02, 2, 0.01), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObjects(model.pickables);
      expect(hits.length).toBeGreaterThan(0);
      height.push(hits[0].point.y);
      model.dispose();
    }
    expect(height[0]).toBeLessThan(0.09);
    expect(height[1]).toBeGreaterThan(0.5);
    expect(height[2]).toBeGreaterThan(0.4);
  });
});

it("closes the whole barrel opening with circular head boards without perimeter gaps", () => {
  const model = createMedievalContainerModel("barrel", "closed");
  const boards = model.pickables.filter(mesh => mesh.name === "barrel-lid-board");
  model.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  for (let ix = -28; ix <= 28; ix++) {
    for (let iz = -28; iz <= 28; iz++) {
      const x = ix / 100;
      const z = iz / 100;
      if (Math.hypot(x, z) > 0.28) continue;
      ray.ray.origin.set(x, 2, z);
      const hits = ray.intersectObjects(boards);
      expect(hits.length, `Uncovered lid at (${x}, ${z})`).toBeGreaterThan(0);
      expect(hits[0].point.y).toBeCloseTo(0.99, 6);
    }
  }
  for (const board of boards) {
    const positions = board.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const point = board.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i));
      expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(0.283001);
    }
  }
  model.dispose();
});

it("releases shared geometries and materials exactly once without affecting another instance", () => {
  const model = createMedievalContainerModel("basket", "loaded");
  const other = createMedievalContainerModel("basket", "loaded");
  const geometries = new Set(model.pickables.map(mesh => mesh.geometry));
  const surfaces = new Set(model.pickables.flatMap(mesh => mesh.material));
  const spies = [...geometries, ...surfaces].map(resource => vi.spyOn(resource, "dispose"));
  const otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  expect(otherDispose).not.toHaveBeenCalled();
  other.dispose();
});
