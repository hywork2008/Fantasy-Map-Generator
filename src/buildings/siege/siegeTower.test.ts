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

it("keeps lower ascents transverse and the exposed roof ascent facing the enemy with real headroom through the deck and its supporting frame", () => {
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
    if (level < 2) expect(top.x).toBeCloseTo(bottom.x);
    else {
      expect(top.x).toBeGreaterThan(bottom.x);
      expect(top.z).toBeCloseTo(bottom.z);
    }
    const directionZ = layout.ladderDirection[level];
    if (level < 2) expect((top.z - bottom.z) * directionZ).toBeGreaterThan(0);
    expect(top.y).toBeGreaterThan(layout.decks[level + 1] + 0.8);
    ascentX.push(top.x);
    const floorY = layout.decks[level + 1] + 0.06;
    const exit = bottom.clone().lerp(top, (floorY - bottom.y) / (top.y - bottom.y));
    // A 0.56 m wide, 1.85 m tall clearance envelope must not hit decking or headers during ascent.
    for (let step = 0; step <= 24; step++) {
      const foot = bottom.clone().lerp(exit, step / 24);
      const zA = foot.z - directionZ * 0.33;
      const zB = foot.z + directionZ * 0.18;
      const body = volume(
        foot.x - 0.28,
        foot.y + 0.12,
        Math.min(zA, zB),
        foot.x + 0.28,
        foot.y + 1.85,
        Math.max(zA, zB)
      );
      const clearance =
        level < 2
          ? body
          : volume(foot.x - 0.33, foot.y + 0.12, foot.z - 0.28, foot.x + 0.18, foot.y + 1.85, foot.z + 0.28);
      for (const mesh of deckMembers)
        expect(bounds(mesh).intersectsBox(clearance), `${mesh.name} blocks ascent ${level}`).toBe(false);
    }
  }
  expect(Math.abs(ascentX[1] - ascentX[0])).toBeGreaterThan(1);

  for (const rung of model.pickables.filter(mesh => mesh.name === "ladder-rung")) {
    const [a, b] = ends(rung);
    expect(a.y).toBeCloseTo(b.y);
    expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBeGreaterThan(0.6);
  }
  model.dispose();
});

it("connects adjacent flights directly across a short landing without walking around a hatch", () => {
  const model = createSiegeTowerModel();
  model.group.updateMatrixWorld(true);
  for (let level = 1; level < 3; level++) {
    const y = layout.decks[level] + 0.06;
    const x = layout.ladderX[level - 1];
    const directionZ = layout.ladderDirection[level - 1];
    const landingZ = directionZ * 1.32;
    const z0 = landingZ - 0.28,
      z1 = landingZ + 0.28;
    const landing = volume(x - 0.28, y + 0.02, z0, x + 0.28, y + 1.85, z1);
    const transfer = volume(
      Math.min(x, level === 2 ? -1.45 : layout.ladderX[level]) - 0.28,
      y + 0.02,
      z0,
      Math.max(x, level === 2 ? -1.45 : layout.ladderX[level]) + 0.28,
      y + 1.85,
      z1
    );
    for (const space of [landing, transfer])
      for (const mesh of model.pickables)
        expect(bounds(mesh).intersectsBox(space), `${mesh.name} blocks landing ${level}`).toBe(false);
    if (level < 2) {
      const nextX = layout.ladderX[level];
      const nextFootZ = layout.ladderDirection[level] * layout.ladderFootZ;
      expect(layout.ladderDirection[level]).toBe(-directionZ);
      // The next foot is at the same landing end, rather than across the room.
      expect(Math.abs(nextFootZ - landingZ)).toBeLessThan(0.45);
      expect(Math.abs(nextX - x)).toBeLessThan(1.2);
      const nextFoot = volume(nextX - 0.28, y + 0.02, z0, nextX + 0.28, y + 1.85, z1);
      for (const mesh of model.pickables)
        expect(bounds(mesh).intersectsBox(nextFoot), `${mesh.name} blocks the next foot ${level}`).toBe(false);
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
  const landingToDoor = volume(-0.2, 7.53, -1.25, 1.1, 9.4, -0.8);
  for (const mesh of model.pickables)
    expect(bounds(mesh).intersectsBox(landingToDoor), `${mesh.name} blocks the exit`).toBe(false);
  expect(parts("winch-drum")).toHaveLength(2);
  expect(parts("winch-common-shaft")).toHaveLength(1);
  expect(parts("winch-operating-wheel")).toHaveLength(1);
  expect(parts("winch-hand-rope")).toHaveLength(1);
  for (const drum of parts("winch-drum")) {
    expect(drum.position.x).toBeCloseTo(parts("winch-common-shaft")[0].position.x);
    expect(drum.position.y).toBeCloseTo(parts("winch-common-shaft")[0].position.y);
  }
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
  for (const operatingPart of [...parts("winch-operating-wheel"), ...parts("winch-hand-rope")]) {
    for (const deck of upperDeck)
      expect(bounds(deck).intersectsBox(bounds(operatingPart)), `${operatingPart.name} clips the roof deck`).toBe(
        false
      );
  }
  const pulleys = parts("hoist-pulley");
  for (const pulley of pulleys) expect(bounds(pulley).min.y).toBeGreaterThan(raised.max.y);
  model.dispose();
});

it("connects the left boarding entry and the roof approach without an aft-facing climb", () => {
  const model = createSiegeTowerModel();
  model.group.updateMatrixWorld(true);
  const stiles = model.pickables.filter(mesh => mesh.name === "boarding-stile");
  expect(stiles.every(mesh => mesh.position.z < 0)).toBe(true);
  expect(Math.abs(layout.boardingZ - layout.ladderFootZ)).toBeLessThan(0.3);
  const routes = [
    volume(-1.72, 1.73, -1.65, -0.8, 3.5, -1.12),
    volume(-1.73, 7.53, -1.32, -1.17, 9.36, -0.34),
    volume(-0.03, 10.43, -0.9, 0.53, 12.2, -0.34)
  ];
  for (const route of routes)
    for (const mesh of model.pickables)
      expect(bounds(mesh).intersectsBox(route), `${mesh.name} blocks the connected approach`).toBe(false);
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
