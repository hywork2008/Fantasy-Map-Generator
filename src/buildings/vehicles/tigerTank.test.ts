import * as THREE from "three";
import { expect, it } from "vitest";
import { createTigerTank, TIGER_I } from "./tigerTank";

it.each(["low", "high"] as const)(
  "%s matches the published envelope, rests on its tracks and points the gun forward",
  quality => {
    const model = createTigerTank(quality);
    model.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model.group);
    const size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(0, 3);
    expect(size.x).toBeCloseTo(TIGER_I.length, 1);
    expect(size.x).toBeLessThanOrEqual(TIGER_I.length + 1e-6);
    expect(size.z).toBeCloseTo(TIGER_I.width, 2);
    expect(size.z).toBeLessThanOrEqual(TIGER_I.width + 1e-6);
    expect(size.y).toBeCloseTo(TIGER_I.height, 2);
    // Only the tracks touch the ground; the muzzle is the forward-most part.
    const lowest = model.pickables.filter(mesh => new THREE.Box3().setFromObject(mesh).min.y < 0.01);
    expect(lowest.length).toBeGreaterThan(0);
    for (const mesh of lowest) expect(mesh.name).toMatch(/^track-/);
    const front = model.pickables.reduce((a, b) =>
      new THREE.Box3().setFromObject(a).max.x > new THREE.Box3().setFromObject(b).max.x ? a : b
    );
    expect(front.name).toBe("muzzle-brake");
    expect(model.pickables.filter(mesh => mesh.name === "road-wheel")).toHaveLength(2 * 8 * 2);
    expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
    model.dispose();
  }
);

it("wraps the high tier in individual links close to the real 96 per side", () => {
  const model = createTigerTank("high");
  const links = model.pickables.filter(mesh => mesh.name === "track-link");
  expect(links.length / 2).toBeGreaterThan(85);
  expect(links.length / 2).toBeLessThan(115);
  expect(model.pickables.filter(mesh => mesh.name === "track-run")).toHaveLength(0);
  model.dispose();
});
