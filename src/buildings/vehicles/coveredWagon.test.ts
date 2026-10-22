import * as THREE from "three";
import { expect, it } from "vitest";
import { COVERED_WAGON, createCoveredWagon } from "./coveredWagon";

it("covers a hollow load bed with open ends and keeps canvas clear of the wheels and driver", () => {
  const model = createCoveredWagon();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(0);
  expect(bounds.max.y).toBeLessThanOrEqual(COVERED_WAGON.height);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(COVERED_WAGON.length);
  expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(COVERED_WAGON.width);
  const throughEnds = new THREE.Raycaster(new THREE.Vector3(-3, 2.7, 0), new THREE.Vector3(1, 0, 0));
  expect(throughEnds.intersectObjects(model.pickables)).toHaveLength(0);
  const roof = new THREE.Raycaster(new THREE.Vector3(-0.6, 2.7, 0), new THREE.Vector3(0, 1, 0));
  expect(roof.intersectObjects(model.pickables)[0].object.name).toBe("canvas-panel");
  const curtains = model.pickables.filter(mesh => mesh.name === "canvas-panel");
  const wheelsAndSeat = model.pickables.filter(mesh => /^(wheel-iron-tire|driver-seat-plank)$/.test(mesh.name));
  for (const panel of curtains) {
    const panelBounds = new THREE.Box3().setFromObject(panel);
    for (const part of wheelsAndSeat)
      expect(panelBounds.intersectsBox(new THREE.Box3().setFromObject(part))).toBe(false);
  }
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.elevation).toContain("<path");
  expect(model.plan).toContain("<path");
  model.dispose();
});
