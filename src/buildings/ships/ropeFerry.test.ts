import * as THREE from "three";
import { expect, it } from "vitest";
import { MEDIEVAL_WAGON } from "../vehicles/medievalWagon";
import { createRopeFerry, ROPE_FERRY } from "./ropeFerry";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);

it.each(["low", "high"] as const)("%s keeps the documented envelope with the waterline at y = 0", quality => {
  const model = createRopeFerry(quality);
  model.group.updateMatrixWorld(true);
  const size = box(model.group).getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(ROPE_FERRY.length, 2);
  expect(size.z).toBeCloseTo(ROPE_FERRY.beam, 2);
  expect(box(model.group).min.y).toBeCloseTo(-ROPE_FERRY.draft, 3);
  expect(box(model.group).max.y).toBeCloseTo(ROPE_FERRY.height, 3);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("takes the freight wagon between the kerbs and inside the hull", () => {
  expect(ROPE_FERRY.laneWidth).toBeGreaterThan(MEDIEVAL_WAGON.width);
  expect(ROPE_FERRY.hullLength).toBeGreaterThan(MEDIEVAL_WAGON.length);
  const model = createRopeFerry("low");
  model.group.updateMatrixWorld(true);
  const kerbs = model.pickables.filter(mesh => mesh.name === "wheel-kerb").map(box);
  expect(kerbs).toHaveLength(2);
  const clear =
    Math.min(...kerbs.map(b => b.min.z).filter(z => z > 0)) - Math.max(...kerbs.map(b => b.max.z).filter(z => z < 0));
  expect(clear).toBeCloseTo(ROPE_FERRY.laneWidth, 3);
  // Both ends stay open: no rail or post crosses the lane.
  for (const mesh of model.pickables.filter(m => m.name === "rail" || m.name === "rail-post")) {
    expect(Math.abs(box(mesh).getCenter(new THREE.Vector3()).z)).toBeGreaterThan(ROPE_FERRY.laneWidth / 2);
  }
  model.dispose();
});

it("is symmetric end to end so a cart drives straight through", () => {
  const model = createRopeFerry("low");
  model.group.updateMatrixWorld(true);
  const flaps = model.pickables.filter(mesh => mesh.name === "loading-flap").map(box);
  expect(flaps).toHaveLength(2);
  expect(flaps[0].min.x).toBeCloseTo(-flaps[1].max.x, 3);
  expect(flaps[0].max.y).toBeCloseTo(flaps[1].max.y, 3);
  model.dispose();
});

it("adds planking and fittings on the high tier", () => {
  const low = createRopeFerry("low"),
    high = createRopeFerry("high");
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of [
    "deck-plank",
    "flap-cleat",
    "hinge-strap",
    "flap-chain",
    "rope-roller",
    "hauling-club",
    "wheel-chock"
  ])
    expect(names.has(name), name).toBe(true);
  expect(low.pickables.some(mesh => mesh.name === "deck-plank")).toBe(false);
  low.dispose();
  high.dispose();
});
