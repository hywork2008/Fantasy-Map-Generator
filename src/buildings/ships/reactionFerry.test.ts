import * as THREE from "three";
import { expect, it } from "vitest";
import { MEDIEVAL_WAGON } from "../vehicles/medievalWagon";
import { createReactionFerry, REACTION_FERRY } from "./reactionFerry";

const box = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);
const named = (model: { pickables: THREE.Mesh[] }, name: string) =>
  model.pickables.filter(m => m.name === name).map(box);

it.each(["low", "high"] as const)("%s keeps the St. Goar 1772 envelope with the waterline at y = 0", quality => {
  const model = createReactionFerry(quality);
  model.group.updateMatrixWorld(true);
  const bounds = box(model.group);
  const size = bounds.getSize(new THREE.Vector3());
  expect(bounds.max.x).toBeCloseTo(REACTION_FERRY.hull.length / 2, 3);
  expect(size.x).toBeCloseTo(REACTION_FERRY.length, 2);
  expect(size.z).toBeCloseTo(REACTION_FERRY.width, 2);
  expect(bounds.min.y).toBeCloseTo(-REACTION_FERRY.draft, 3);
  expect(bounds.max.y).toBeCloseTo(REACTION_FERRY.height, 3);
  expect(model.elevation + model.plan).not.toMatch(/NaN|Infinity|undefined/);
  model.dispose();
});

it("joins two identical bridge ships of 82.5 × 12.5 Schuh", () => {
  const model = createReactionFerry("low");
  model.group.updateMatrixWorld(true);
  const ships = named(model, "bridge-ship").map(b => b.getSize(new THREE.Vector3()));
  expect(ships).toHaveLength(2);
  for (const size of ships) {
    expect(size.x).toBeCloseTo(23.5, 2);
    // 12.5 Schuh at Kuhn's 82.5 Schuh = 23.5 m; his table rounds it to 3.5 m.
    expect(size.z).toBeCloseTo((12.5 * 23.5) / 82.5, 2);
  }
  expect(ships[0].y).toBeCloseTo(ships[1].y, 6);
  // The floor stands on posts above the sheer of both ships at its ends, where the sheer rises most.
  const posts = named(model, "floor-post");
  expect(posts).toHaveLength(4);
  for (const post of posts) expect(post.max.y - post.min.y).toBeGreaterThan(0.2);
  model.dispose();
});

it("runs the yaw rope between the two crossbars about 7 m above the floor", () => {
  const model = createReactionFerry("low");
  model.group.updateMatrixWorld(true);
  const [low, high] = named(model, "katze").sort((a, b) => a.min.y - b.min.y);
  expect(low.min.y - REACTION_FERRY.deckY).toBeGreaterThan(6.5);
  expect(high.min.y - REACTION_FERRY.deckY).toBeLessThan(7.6);
  const ropeY = (REACTION_FERRY.katze.low + REACTION_FERRY.katze.high) / 2;
  expect(ropeY).toBeGreaterThan(low.max.y);
  expect(ropeY).toBeLessThan(high.min.y);
  model.dispose();
});

it("leaves the gates and the lane between the masts wide enough for a wagon", () => {
  expect(REACTION_FERRY.gateWidth).toBeGreaterThan(MEDIEVAL_WAGON.width + 1);
  const model = createReactionFerry("low");
  model.group.updateMatrixWorld(true);
  const masts = [...named(model, "great-mast"), ...named(model, "small-mast")];
  const lane = Math.min(...masts.map(m => Math.min(Math.abs(m.min.z), Math.abs(m.max.z))));
  expect(2 * lane).toBeGreaterThan(MEDIEVAL_WAGON.width + 1);
  // No railing post stands in a gate.
  for (const post of named(model, "rail-post")) {
    const x = (post.min.x + post.max.x) / 2;
    if (Math.abs(post.min.z) > 3) expect(Math.abs(x)).toBeGreaterThanOrEqual(REACTION_FERRY.gateWidth / 2 - 1e-6);
  }
  model.dispose();
});

it("adds balusters, rigging and the bell on the high tier", () => {
  const low = createReactionFerry("low"),
    high = createReactionFerry("high");
  const names = new Set(high.pickables.map(mesh => mesh.name));
  for (const name of ["baluster", "shroud", "bell", "anchor-capstan", "bilge-pump", "rubbing-timber-corner"])
    expect(names.has(name), name).toBe(true);
  expect(low.pickables.some(mesh => mesh.name === "baluster")).toBe(false);
  low.dispose();
  high.dispose();
});
