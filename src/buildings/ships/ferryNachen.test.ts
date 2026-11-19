import * as THREE from "three";
import { expect, it } from "vitest";
import { createFerryNachen, FERRY_NACHEN } from "./ferryNachen";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);

it.each(["low", "high"] as const)("%s matches the 1846 Weldergoven register with the waterline at y = 0", quality => {
  const model = createFerryNachen(quality);
  model.group.updateMatrixWorld(true);
  const bounds = box(model.group);
  const size = bounds.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(FERRY_NACHEN.length, 2);
  expect(size.z).toBeCloseTo(FERRY_NACHEN.beam, 2);
  expect(bounds.min.y).toBeCloseTo(-FERRY_NACHEN.draft, 3);
  expect(bounds.max.y).toBeCloseTo(FERRY_NACHEN.height, 3);
  // Depth amidships, bottom to gunwale.
  const hull = model.pickables.filter(m => m.name === "side-board").map(box)[0];
  expect(hull.min.y).toBeCloseTo(-FERRY_NACHEN.draft, 3);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("seats its passengers on thwarts inside the hull", () => {
  const model = createFerryNachen("low");
  model.group.updateMatrixWorld(true);
  const thwarts = model.pickables.filter(m => m.name === "thwart").map(box);
  expect(2 * thwarts.length).toBe(FERRY_NACHEN.passengers);
  for (const thwart of thwarts) {
    // Two people abreast on every thwart, the end ones included.
    expect(thwart.max.z - thwart.min.z).toBeGreaterThan(0.95);
    expect(thwart.max.z).toBeLessThan(FERRY_NACHEN.beam / 2);
  }
  model.dispose();
});

it("adds frames and fittings on the high tier", () => {
  const low = createFerryNachen("low"),
    high = createFerryNachen("high");
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of ["frame", "floor-board", "thole", "pole-shoe", "painter", "bailer"])
    expect(names.has(name), name).toBe(true);
  expect(low.pickables.some(mesh => mesh.name === "frame")).toBe(false);
  low.dispose();
  high.dispose();
});

it("keeps every fitting inside the hull, above the bottom board", () => {
  const model = createFerryNachen("high");
  model.group.updateMatrixWorld(true);
  const hull = box(model.pickables.find(m => m.name === "bottom-board")!);
  for (const mesh of model.pickables.filter(m => m.name === "floor-board" || m.name === "frame")) {
    const b = box(mesh);
    // Test the end farther from midships, where the bottom has risen most.
    const x = Math.abs(b.min.x) > Math.abs(b.max.x) ? b.min.x : b.max.x;
    // The bottom rises toward the ends; nothing may poke below it there.
    const t = Math.abs(x / (FERRY_NACHEN.length / 2));
    const bottom = -FERRY_NACHEN.draft + 0.85 * t ** 3;
    expect(b.min.y, `${mesh.name} at x = ${x.toFixed(2)}`).toBeGreaterThan(Math.max(bottom, hull.min.y) - 1e-3);
  }
  model.dispose();
});
