import * as THREE from "three";
import { expect, it } from "vitest";
import { BENZ_MOTORWAGEN, createBenzMotorwagen } from "./benzMotorwagen";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);
const extreme = (meshes: THREE.Mesh[], key: (b: THREE.Box3) => number) =>
  meshes.reduce((a, b) => (key(box(a)) > key(box(b)) ? a : b));

it.each(["low", "high"] as const)("%s matches the published envelope and stands on three tyres", quality => {
  const model = createBenzMotorwagen(quality);
  model.group.updateMatrixWorld(true);
  const bounds = box(model.group);
  const size = bounds.getSize(new THREE.Vector3());
  expect(bounds.min.y).toBeCloseTo(0, 3);
  expect(size.x).toBeCloseTo(BENZ_MOTORWAGEN.length, 2);
  expect(size.z).toBeCloseTo(BENZ_MOTORWAGEN.width, 2);
  expect(size.y).toBeCloseTo(BENZ_MOTORWAGEN.height, 2);
  const grounded = model.pickables.filter(mesh => box(mesh).min.y < 0.01);
  expect(grounded.map(mesh => mesh.name).sort()).toEqual(["front-tyre", "rear-tyre", "rear-tyre"]);
  expect(extreme(model.pickables, b => b.max.x).name).toBe("front-tyre");
  expect(extreme(model.pickables, b => -b.min.x).name).toBe("flywheel");
  expect(extreme(model.pickables, b => b.max.y).name).toBe("tiller-handle");
  expect(extreme(model.pickables, b => b.max.z).name).toBe("hub-cap");
  // The wheelbase runs from the front hub to the rear axle.
  const [front, ...rear] = ["front-hub", "rear-hub", "rear-hub"].map(name =>
    model.pickables.filter(m => m.name === name)
  );
  expect(front).toHaveLength(1);
  expect(rear[0]).toHaveLength(2);
  const centre = (m: THREE.Mesh) => box(m).getCenter(new THREE.Vector3());
  expect(centre(front[0]).x - centre(rear[0][0]).x).toBeCloseTo(BENZ_MOTORWAGEN.wheelbase, 3);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("keeps the horizontal flywheel clear of the rear axle and the ground", () => {
  const model = createBenzMotorwagen("high");
  model.group.updateMatrixWorld(true);
  const flywheel = box(model.pickables.find(m => m.name === "flywheel")!);
  const axle = box(model.pickables.find(m => m.name === "rear-axle")!);
  expect(flywheel.min.y).toBeGreaterThan(0.3);
  expect(flywheel.intersectsBox(axle)).toBe(false);
  model.dispose();
});

it("adds the drive train and spokes on the high tier", () => {
  const low = createBenzMotorwagen("low"),
    high = createBenzMotorwagen("high");
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of ["chain", "belt", "differential", "rear-spring", "steering-rack", "water-jacket", "carburettor"])
    expect(names.has(name), name).toBe(true);
  expect(low.pickables.some(mesh => mesh.name === "chain")).toBe(false);
  expect(high.pickables.filter(m => m.name === "spoke").length).toBe(24 + 2 * 32);
  expect(high.pickables.length).toBeGreaterThan(low.pickables.length * 2);
  low.dispose();
  high.dispose();
});
