import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createPontDuGard } from "./pontDuGard";

describe("Pont du Gard assembly", () => {
  it("joins repeated bays while preserving open arches and an open water channel", () => {
    const model = createPontDuGard(2);
    model.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model.group);
    expect(bounds.min.x).toBe(-24);
    expect(bounds.max.x).toBe(24);
    expect(bounds.max.y).toBeCloseTo(49);
    const front = (x: number, y: number) =>
      new THREE.Raycaster(new THREE.Vector3(x, y, 10), new THREE.Vector3(0, 0, -1)).intersectObjects(model.pickables);
    expect(front(-12, 5)).toHaveLength(0);
    expect(front(-12, 25)).toHaveLength(0);
    expect(front(-21, 42)).toHaveLength(0);
    expect(front(0, 5).length).toBeGreaterThan(0);
    const channel = new THREE.Raycaster(new THREE.Vector3(0, 55, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(
      model.pickables
    );
    expect(channel[0].point.y).toBeCloseTo(47.4);
    expect(model.pickables[0].geometry).toBe(model.pickables[1].geometry);
    model.dispose();
  });
});
