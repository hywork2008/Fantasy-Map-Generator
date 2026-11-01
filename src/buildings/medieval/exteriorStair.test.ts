import * as THREE from "three";
import { expect, it } from "vitest";
import { createExteriorStair, exteriorStairLayout } from "./exteriorStair";

it.each([
  { rise: 3.32, run: 5.7, width: 1.42, landingDepth: 1.5, doorWidth: 1.1 },
  { rise: 2.4, run: 4, width: 1.2, landingDepth: 1.6, doorWidth: 1.2 }
])("shared stair regenerates from dimensions with a protected, open landing", options => {
  const layout = exteriorStairLayout(options),
    model = createExteriorStair(options);
  model.group.updateMatrixWorld(true);
  expect(layout.doorway.position[0]).toBe(-layout.landingWidth / 2);
  for (const z of [-options.doorWidth * 0.45, 0, options.doorWidth * 0.45])
    for (let y = options.rise + 0.25; y < options.rise + 2; y += 0.035) {
      const opening = new THREE.Raycaster(
        new THREE.Vector3(0, y, z),
        new THREE.Vector3(-1, 0, 0),
        0,
        layout.landingWidth / 2 + 0.1
      ).intersectObjects(model.pickables);
      expect(opening).toHaveLength(0);
    }
  const floor = new THREE.Raycaster(
    new THREE.Vector3(0, options.rise + 0.1, 0),
    new THREE.Vector3(0, -1, 0),
    0,
    0.3
  ).intersectObjects(model.pickables)[0];
  expect(floor.point.y).toBeCloseTo(options.rise, 5);
  for (const x of [-options.width / 2 + 0.11, options.width / 2 - 0.11]) {
    const underside = new THREE.Raycaster(
      new THREE.Vector3(x, options.rise - 0.2, 0),
      new THREE.Vector3(0, 1, 0),
      0,
      0.1
    ).intersectObjects(model.pickables)[0];
    expect(underside.point.y).toBeCloseTo(options.rise - 0.18, 5);
  }
  for (const x of [0, layout.landingWidth / 2 - 0.06]) {
    const guard = new THREE.Raycaster(
      new THREE.Vector3(x, options.rise + 0.95, -options.landingDepth / 2 - 0.2),
      new THREE.Vector3(0, 0, 1),
      0,
      0.4
    ).intersectObjects(model.pickables);
    expect(guard.length).toBeGreaterThan(0);
  }
  model.dispose();
});

it("rejects landing dimensions that cannot preserve the doorway clearance", () => {
  expect(() => createExteriorStair({ rise: 3.32, run: 5.7, width: 1.42, landingDepth: 1.1, doorWidth: 1.1 })).toThrow(
    /clearance/
  );
});
