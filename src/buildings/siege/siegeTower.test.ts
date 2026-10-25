import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createSiegeTower, createSiegeTowerModel, SIEGE_TOWER_LAYOUT as layout, SIEGE_TOWER } from "./siegeTower";

const bounds = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);
const volume = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
  new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));

it("grounds four wheels and generates finite projections within the study envelope", () => {
  const model = createSiegeTower();
  model.group.updateMatrixWorld(true);
  const envelope = bounds(model.group);
  expect(envelope.min.y).toBeCloseTo(0);
  expect(envelope.max.y).toBeLessThanOrEqual(SIEGE_TOWER.height);
  expect(envelope.max.x - envelope.min.x).toBeLessThanOrEqual(SIEGE_TOWER.length);
  expect(envelope.max.z - envelope.min.z).toBeLessThanOrEqual(SIEGE_TOWER.width);
  const wheels = model.pickables.filter(mesh => mesh.name === "wheel-iron-tire");
  expect(wheels).toHaveLength(4);
  for (const wheel of wheels) expect(bounds(wheel).min.y).toBeCloseTo(0);
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.plan).toContain("<path");
  expect(model.elevation).not.toBe(model.plan);
  model.dispose();
});

it("uses transverse staggered ascents with real headroom through the deck and its supporting frame", () => {
  const model = createSiegeTowerModel();
  model.group.updateMatrixWorld(true);
  const stiles = model.pickables.filter(mesh => mesh.name === "ladder-stile");
  const ends = (mesh: THREE.Mesh) => [-0.5, 0.5].map(y => mesh.localToWorld(new THREE.Vector3(0, y, 0)));
  expect(stiles).toHaveLength(6);
  const ascentX: number[] = [];
  const deckMembers = model.pickables.filter(mesh =>
    /^(floor-plank|floor-joist|hatch-header|hatch-trimmer)$/.test(mesh.name)
  );
  for (let level = 0; level < 3; level++) {
    const left = ends(stiles[level * 2]),
      right = ends(stiles[level * 2 + 1]);
    const bottom = left[0].clone().add(right[0]).multiplyScalar(0.5);
    const top = left[1].clone().add(right[1]).multiplyScalar(0.5);
    expect(top.x).toBeCloseTo(bottom.x);
    expect(top.z).toBeGreaterThan(bottom.z);
    expect(top.y).toBeGreaterThan(layout.decks[level + 1] + 0.8);
    ascentX.push(top.x);
    const floorY = layout.decks[level + 1] + 0.06;
    const exit = bottom.clone().lerp(top, (floorY - bottom.y) / (top.y - bottom.y));
    // A 0.56 m wide, 1.85 m tall clearance envelope must not hit decking or headers during ascent.
    for (let step = 0; step <= 24; step++) {
      const foot = bottom.clone().lerp(exit, step / 24);
      const body = volume(foot.x - 0.28, foot.y + 0.12, foot.z - 0.33, foot.x + 0.28, foot.y + 1.85, foot.z + 0.18);
      for (const mesh of deckMembers)
        expect(bounds(mesh).intersectsBox(body), `${mesh.name} blocks ascent ${level}`).toBe(false);
    }
  }
  expect(Math.abs(ascentX[1] - ascentX[0])).toBeGreaterThan(1);
  expect(Math.abs(ascentX[2] - ascentX[1])).toBeGreaterThan(1);
  for (const rung of model.pickables.filter(mesh => mesh.name === "ladder-rung")) {
    const [a, b] = ends(rung);
    expect(a.y).toBeCloseTo(b.y);
    expect(a.z).toBeCloseTo(b.z);
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(0.6);
  }
  model.dispose();
});

it("leaves standing landings and a separate approach to the next ladder", () => {
  const model = createSiegeTowerModel();
  model.group.updateMatrixWorld(true);
  for (let level = 1; level < layout.decks.length; level++) {
    const y = layout.decks[level] + 0.06;
    const x = layout.ladderX[level - 1];
    const landing = volume(x - 0.28, y + 0.02, 0.68, x + 0.28, y + 1.85, 1.3);
    const transfer = volume(
      Math.min(x, layout.ladderX[level] ?? 0) - 0.28,
      y + 0.02,
      0.8,
      Math.max(x, layout.ladderX[level] ?? 0) + 0.28,
      y + 1.85,
      1.3
    );
    for (const space of [landing, transfer])
      for (const mesh of model.pickables)
        expect(bounds(mesh).intersectsBox(space), `${mesh.name} blocks landing ${level}`).toBe(false);
    if (level < 3) {
      const nextX = layout.ladderX[level];
      const approach = volume(nextX - 0.28, y + 0.02, -1.3, nextX + 0.28, y + 1.85, 0.8);
      // The next ladder itself is the destination; no other ascent, guard or frame may block its approach.
      for (const mesh of model.pickables.filter(mesh => !mesh.name.startsWith("ladder-")))
        expect(bounds(mesh).intersectsBox(approach), `${mesh.name} blocks approach ${level}`).toBe(false);
    }
  }
  model.dispose();
});

it("keeps the assault corridor clear of winding shafts and ropes and fits the raised bridge below the archer deck", () => {
  const model = createSiegeTowerModel();
  model.group.updateMatrixWorld(true);
  const parts = (name: string) => model.pickables.filter(mesh => mesh.name === name);
  const hingeX = parts("bridge-hinge")[0].position.x;
  const corridor = volume(
    0.75,
    7.53,
    -layout.passageHalfWidth,
    hingeX + layout.bridgeLength,
    9.55,
    layout.passageHalfWidth
  );
  for (const mesh of model.pickables)
    expect(bounds(mesh).intersectsBox(corridor), `${mesh.name} blocks the assault`).toBe(false);
  const landingToDoor = volume(-0.2, 7.53, 0.8, 1.1, 9.4, 1.25);
  for (const mesh of model.pickables)
    expect(bounds(mesh).intersectsBox(landingToDoor), `${mesh.name} blocks the exit`).toBe(false);
  expect(parts("winch-drum")).toHaveLength(2);
  expect(parts("bridge-hoist-rope")).toHaveLength(2);
  const threshold = bounds(parts("bridge-threshold")[0]);
  const bridge = new THREE.Box3();
  for (const mesh of parts("bridge-plank")) bridge.union(bounds(mesh));
  expect(bridge.max.y).toBeCloseTo(threshold.max.y);
  expect(bridge.min.x).toBeLessThan(threshold.max.x);
  // Rotate every moving bridge corner about the actual hinge into its closed position.
  const pivot = new THREE.Vector3(hingeX, 7.4, 0);
  const raised = new THREE.Box3();
  for (const mesh of model.pickables.filter(mesh =>
    /^(bridge-plank|bridge-stringer|bridge-lifting-lug)$/.test(mesh.name)
  )) {
    const positions = mesh.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).sub(pivot);
      raised.expandByPoint(new THREE.Vector3(-p.y, p.x, p.z).add(pivot));
    }
  }
  const upperDeck = parts("floor-plank").filter(mesh => mesh.position.y === layout.decks[3]);
  expect(raised.max.y).toBeLessThan(Math.min(...upperDeck.map(mesh => bounds(mesh).min.y)));
  const pulleys = parts("hoist-pulley");
  for (const pulley of pulleys) expect(bounds(pulley).min.y).toBeGreaterThan(raised.max.y);
  model.dispose();
});

it("disposes all shared resources exactly once", () => {
  const model = createSiegeTowerModel();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const mesh of model.pickables) {
    resources.add(mesh.geometry);
    for (const material of [mesh.material].flat()) resources.add(material);
  }
  const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
});
