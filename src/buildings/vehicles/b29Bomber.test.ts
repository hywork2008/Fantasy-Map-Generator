import * as THREE from "three";
import { expect, it } from "vitest";
import { B29, createB29 } from "./b29Bomber";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);

it.each(["low", "high"] as const)(
  "%s matches the published envelope, stands on its tyres and faces the nose forward",
  quality => {
    const model = createB29(quality);
    model.group.updateMatrixWorld(true);
    const size = box(model.group).getSize(new THREE.Vector3());
    expect(box(model.group).min.y).toBeCloseTo(0, 3);
    expect(size.x).toBeCloseTo(B29.length, 2);
    expect(size.z).toBeCloseTo(B29.span, 2);
    expect(size.y).toBeCloseTo(B29.height, 2);
    const lowest = model.pickables.filter(mesh => box(mesh).min.y < 0.01);
    expect(lowest.length).toBe(6);
    for (const mesh of lowest) expect(mesh.name).toBe("tire");
    const extreme = (sign: number) =>
      model.pickables.reduce((a, b) => (sign * box(a).max.x > sign * box(b).max.x ? a : b));
    expect(extreme(1).name).toBe("nose-glazing");
    expect(model.pickables.filter(mesh => mesh.name === "nacelle")).toHaveLength(4);
    expect(model.pickables.filter(mesh => mesh.name === "propeller-blade")).toHaveLength(16);
    // Every propeller clears the ground and the fuselage.
    for (const mesh of model.pickables.filter(m => m.name.startsWith("propeller-"))) {
      const bounds = box(mesh);
      expect(bounds.min.y).toBeGreaterThan(0.5);
      expect(Math.min(Math.abs(bounds.min.z), Math.abs(bounds.max.z))).toBeGreaterThan(1.45);
    }
    expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
    model.dispose();
  }
);

it("adds control surfaces and fittings on the high tier", () => {
  const low = createB29("low"),
    high = createB29("high");
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of ["flap", "aileron", "elevator", "rudder", "cowl-flap", "glazing-frame", "propeller-tip"])
    expect(names.has(name), name).toBe(true);
  expect(low.pickables.some(mesh => mesh.name === "aileron")).toBe(false);
  expect(high.pickables.length).toBeGreaterThan(low.pickables.length * 3);
  low.dispose();
  high.dispose();
});
