import * as THREE from "three";
import { OBB } from "three/examples/jsm/math/OBB.js";
import { expect, it, vi } from "vitest";
import {
  createSiegeTower,
  createSiegeTowerModel,
  SIEGE_TOWER_LAYOUT as layout,
  SIEGE_TOWER,
  siegeTowerFrontX,
  siegeTowerRearX
} from "./siegeTower";

const bounds = (mesh: THREE.Object3D) => new THREE.Box3().setFromObject(mesh);
// Raked posts and long rear ladders need oriented bounds; their world AABBs cover empty interior space.
const overlaps = (mesh: THREE.Mesh, space: THREE.Box3) => {
  mesh.geometry.computeBoundingBox();
  const part = new OBB().fromBox3(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
  return part.intersectsOBB(new OBB().fromBox3(space));
};
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
        expect(overlaps(mesh, clearance), `${mesh.name} blocks ascent ${level}`).toBe(false);
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
    const landingZ = directionZ * (level === 2 ? 1.36 : 1.32);
    const z0 = landingZ - 0.28,
      z1 = landingZ + 0.28;
    const landing = volume(x - 0.28, y + 0.02, z0, x + 0.28, y + 1.85, z1);
    const transfer = volume(
      Math.min(x, level === 2 ? -1.55 : layout.ladderX[level]) - 0.28,
      y + 0.02,
      z0,
      Math.max(x, level === 2 ? -1.55 : layout.ladderX[level]) + 0.28,
      y + 1.85,
      z1
    );
    for (const space of [landing, transfer])
      for (const mesh of model.pickables)
        expect(overlaps(mesh, space), `${mesh.name} blocks landing ${level}`).toBe(false);
    if (level < 2) {
      const nextX = layout.ladderX[level];
      const nextFootZ = layout.ladderDirection[level] * layout.ladderFootZ;
      expect(layout.ladderDirection[level]).toBe(-directionZ);
      // The next foot is at the same landing end, rather than across the room.
      expect(Math.abs(nextFootZ - landingZ)).toBeLessThan(0.45);
      expect(Math.abs(nextX - x)).toBeLessThan(1.2);
      const nextFoot = volume(nextX - 0.28, y + 0.02, z0, nextX + 0.28, y + 1.85, z1);
      for (const mesh of model.pickables)
        expect(overlaps(mesh, nextFoot), `${mesh.name} blocks the next foot ${level}`).toBe(false);
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
  for (const mesh of model.pickables) expect(overlaps(mesh, corridor), `${mesh.name} blocks the assault`).toBe(false);
  const landingToDoor = volume(-0.65, 7.53, -1.68, 1.1, 9.4, -1.12);
  for (const mesh of model.pickables) expect(overlaps(mesh, landingToDoor), `${mesh.name} blocks the exit`).toBe(false);
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
    volume(siegeTowerRearX(1.65) + 0.25, 1.73, -1.65, -1.12, 3.5, -1.12),
    volume(-1.83, 7.53, -1.4, -1.27, 9.36, -0.4),
    volume(-0.53, 10.43, -0.96, 0.03, 12.2, -0.4)
  ];
  for (const route of routes)
    for (const mesh of model.pickables)
      expect(overlaps(mesh, route), `${mesh.name} blocks the connected approach`).toBe(false);
  model.dispose();
});

it("never sends an archer aft between the assault-deck arrival and the roof ladder", () => {
  const model = createSiegeTowerModel();
  model.group.updateMatrixWorld(true);
  const stiles = model.pickables.filter(mesh => mesh.name === "ladder-stile");
  const pairCenter = (flight: number, end: number) =>
    stiles
      .slice(flight * 2, flight * 2 + 2)
      .map(mesh => mesh.localToWorld(new THREE.Vector3(0, end, 0)))
      .reduce((sum, p) => sum.add(p), new THREE.Vector3())
      .multiplyScalar(0.5);
  const arrival = pairCenter(1, 0.5);
  const roofFoot = pairCenter(2, -0.5);
  // The approach needs 0.35 m behind the foot for a body and must still be ahead of the arrival.
  const approachX = roofFoot.x - 0.35;
  expect(layout.ladderX[0]).toBeGreaterThan(layout.ladderX[1]);
  expect(approachX).toBeGreaterThan(arrival.x + 0.3);
  expect(roofFoot.x).toBeGreaterThan(approachX);
  expect(pairCenter(2, 0.5).x).toBeGreaterThan(roofFoot.x);
  const landingZ = -1.36;
  const forwardTransfer = volume(arrival.x - 0.28, 7.53, landingZ - 0.28, approachX + 0.28, 9.36, landingZ + 0.28);
  const sidewaysApproach = volume(approachX - 0.28, 7.53, landingZ, approachX + 0.28, 9.36, roofFoot.z + 0.28);
  for (const space of [forwardTransfer, sidewaysApproach])
    for (const mesh of model.pickables)
      expect(overlaps(mesh, space), `${mesh.name} forces a detour on the archer route`).toBe(false);
  model.dispose();
});

it("reserves three forward archer positions independently of the rear ladder landing", () => {
  const model = createSiegeTowerModel();
  model.group.updateMatrixWorld(true);
  // Three 1 m wide stations share a 1.5 m deep uninterrupted strip behind the front parapet.
  for (const z of [-1, 0, 1]) {
    const station = volume(0.35, 10.43, z - 0.48, 1.85, 12.25, z + 0.48);
    for (const mesh of model.pickables)
      expect(overlaps(mesh, station), `${mesh.name} occupies the firing line`).toBe(false);
    for (const x of [0.4, 1, 1.8]) {
      const floor = new THREE.Raycaster(new THREE.Vector3(x, 10.5, z), new THREE.Vector3(0, -1, 0)).intersectObjects(
        model.pickables.filter(mesh => mesh.name === "floor-plank" && mesh.position.y === 10.35)
      );
      expect(floor.length).toBeGreaterThan(0);
    }
  }
  const posts = model.pickables.filter(mesh => mesh.name === "corner-post");
  const lean = (mesh: THREE.Mesh) => {
    const a = mesh.localToWorld(new THREE.Vector3(0, -0.5, 0));
    const b = mesh.localToWorld(new THREE.Vector3(0, 0.5, 0));
    return Math.abs((b.x - a.x) / (b.y - a.y));
  };
  const rear = posts.filter(mesh => mesh.position.x < -2);
  const front = posts.filter(mesh => mesh.position.x > 1);
  expect(rear).toHaveLength(2);
  expect(front).toHaveLength(2);
  for (const post of rear) expect(lean(post)).toBeGreaterThan(0.35);
  for (const post of front) expect(lean(post)).toBeLessThan(0.01);
  expect(siegeTowerFrontX(10.35) - siegeTowerRearX(10.35)).toBeGreaterThan(4.2);
  const outside = model.pickables.filter(mesh => mesh.name === "rear-access-stile");
  expect(outside).toHaveLength(2);
  for (const stile of outside) expect(lean(stile)).toBeGreaterThan(0.35);
  const arrival = volume(-0.53, 10.43, -0.96, 0.03, 12.2, -0.4);
  for (const mesh of model.pickables)
    expect(overlaps(mesh, arrival), `${mesh.name} crowds the roof arrival`).toBe(false);
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
