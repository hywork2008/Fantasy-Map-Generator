import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { type ModelPartRange, modelParts } from "../modelParts";
import { createGalleon } from "./galleon";
import { createGunportFrames, createGunportMoving } from "./galleonArmament";
import { createMerchantShipHigh, galleonGunportMounts, merchantShipParts } from "./merchantShipHigh";
import { createOpusGalleon, opusGalleonParts } from "./opusGalleon";

it("preserves the legacy Codex Low and both Opus default fingerprints", () => {
  for (const [create, hash] of [
    [createGalleon, "fdef4645faac8674e3ee4ba554ccc2a95ad925720907a1171880668ddfbffa24"],
    [() => createOpusGalleon("low"), "3cdbc83a5aa4a7c36fbbf16d44998e3bcb40331c32a3fe581f03fa40122c2b7d"],
    [() => createOpusGalleon("high"), "b1b7af45569aaa31b20e7b92fce7eea2d4055878cd4485e0f80f1c340ab17e56"]
  ] as const) {
    const model = create();
    expect(landmarkFingerprint(model.group)).toBe(hash);
    model.dispose();
  }
});

it("opens real High hull apertures and closes every lid with the barrels fully inside", () => {
  const ports = galleonGunportMounts(),
    hull = merchantShipParts("galleon")
      .find(p => p.id === "hull")!
      .create();
  hull.group.updateMatrixWorld(true);
  const closed = createGunportMoving(ports, true);
  closed.group.updateMatrixWorld(true);
  for (const port of ports) {
    const point = new THREE.Vector3(...port.point),
      normal = new THREE.Vector3(...port.normal),
      q = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(
          new THREE.Vector3(0, 1, 0).cross(normal).normalize(),
          new THREE.Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize(),
          normal
        )
      );
    const origin = point.clone().addScaledVector(normal, 2),
      direction = normal.clone().negate();
    const hits = new THREE.Raycaster(origin, direction, 0, 2.4).intersectObjects(hull.pickables);
    expect(hits).toHaveLength(0);
    for (const x of [-0.45, 0, 0.45])
      for (const y of [-0.45, 0, 0.45]) {
        const sample = origin.clone().add(new THREE.Vector3(x * port.width, y * port.height, 0).applyQuaternion(q));
        const hit = new THREE.Raycaster(sample, direction, 0, 3).intersectObjects(
          closed.pickables.filter(m => m.name === "gunport-lid-closed")
        );
        expect(hit.length).toBeGreaterThan(0);
      }
  }
  for (const mesh of closed.pickables.filter(m => m.name === "cannon-stowed")) {
    const geometry = mesh.geometry.getAttribute("position"),
      port = ports.find(p => p.id === mesh.parent!.name)!;
    const point = new THREE.Vector3(...port.point),
      normal = new THREE.Vector3(...port.normal);
    let max = -Infinity;
    for (let i = 0; i < geometry.count; i++)
      max = Math.max(
        max,
        new THREE.Vector3().fromBufferAttribute(geometry, i).applyMatrix4(mesh.matrixWorld).sub(point).dot(normal)
      );
    expect(max).toBeLessThan(-0.2);
  }
  hull.dispose();
  closed.dispose();
});

it("keeps the High structural parts and flags unchanged across both independent state axes", () => {
  const baseline = merchantShipParts("galleon");
  for (const id of [
    "hull",
    "deck",
    "forecastle",
    "sterncastle",
    "poop",
    "equipment",
    "spars",
    "rigging",
    "flags",
    "port-frames"
  ]) {
    const base = baseline.find(p => p.id === id)!.create(),
      hash = landmarkFingerprint(base.group);
    base.dispose();
    const alternate = merchantShipParts("galleon", { sails: "furled", gunports: "closed" })
      .find(p => p.id === id)!
      .create();
    expect(landmarkFingerprint(alternate.group)).toBe(hash);
    alternate.dispose();
  }
});

describe.each(["low", "high"] as const)("%s", quality => {
  it.each(["set", "furled"] as const)(
    "closes all 28 Opus ports, including stern chasers, with no cannon protrusion (%s)",
    sails => {
      const model = createOpusGalleon(quality, { sails, gunports: "closed", part: "armament" });
      model.group.updateMatrixWorld(true);
      const ports = model.group.userData.gunports as { point: number[]; normal: number[]; id: string }[];
      expect(ports).toHaveLength(28);
      expect(ports.filter(p => p.id.startsWith("stern"))).toHaveLength(2);
      for (const port of ports) {
        const point = new THREE.Vector3(...port.point),
          normal = new THREE.Vector3(...port.normal);
        const hits = new THREE.Raycaster(
          point.clone().addScaledVector(normal, 2),
          normal.clone().negate(),
          0,
          3
        ).intersectObjects(model.pickables);
        expect(hits.length).toBeGreaterThan(0);
        const outward = hits[0].point.clone().sub(point).dot(normal);
        expect(outward).toBeGreaterThan(0.05);
        expect(outward).toBeLessThan(0.32);
      }
      model.dispose();
    }
  );
  it("replaces Opus's front course with a tied bundle and removes the set cloth", () => {
    for (const sails of ["set", "furled"] as const) {
      const model = createOpusGalleon(quality, { sails, part: "sails" });
      model.group.updateMatrixWorld(true);
      const hits = new THREE.Raycaster(
        new THREE.Vector3(20, 14.4, 0),
        new THREE.Vector3(-1, 0, 0),
        0,
        15
      ).intersectObjects(model.pickables);
      expect(hits.some(h => h.point.x > 5)).toBe(sails === "set");
      model.dispose();
    }
  });
  it.each(["set", "furled"] as const)(
    "retains all semantic parts and owns all final resources in both gunport states (%s)",
    sails => {
      for (const gunports of ["open", "closed"] as const)
        for (const opus of [false, true]) {
          const state = { sails, gunports },
            model = opus
              ? createOpusGalleon(quality, state)
              : quality === "high"
                ? createMerchantShipHigh("galleon", state)
                : createGalleon(state);
          const resources = new Set<THREE.BufferGeometry | THREE.Material>(),
            ids = new Set(modelParts(model.group).map(p => p.id));
          if (opus) expect(ids.size).toBe(6);
          else if (quality === "high") expect(ids.size).toBe(16);
          model.group.traverse(object => {
            const draw = object as THREE.Mesh;
            if (!draw.isMesh && !(object as THREE.LineSegments).isLineSegments) return;
            resources.add(draw.geometry);
            for (const mat of [draw.material].flat()) resources.add(mat);
            expect([...draw.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
            if (draw.isMesh && (opus || quality === "high")) {
              const ranges = draw.userData.modelPartRanges as ModelPartRange[];
              expect(ranges.every(r => ids.has(r.partId))).toBe(true);
              expect(ranges.reduce((sum, r) => sum + r.count, 0)).toBe(draw.geometry.getAttribute("position").count);
            }
          });
          const spies = [...resources].map(r => vi.spyOn(r, "dispose"));
          model.dispose();
          for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
        }
    }
  );
  it("isolates every Opus component and its lines without leaking other part ranges", () => {
    for (const factory of opusGalleonParts(quality, { sails: "furled", gunports: "closed" })) {
      const model = factory.create();
      expect(modelParts(model.group).map(p => p.id)).toEqual([factory.id]);
      model.group.traverse(object => {
        const draw = object as THREE.Mesh;
        if (!draw.isMesh && !(object as THREE.LineSegments).isLineSegments) return;
        expect((draw.userData.modelPartRanges as ModelPartRange[]).every(r => r.partId === factory.id)).toBe(true);
      });
      model.dispose();
    }
  });
});

it("supports the projecting beakhead with knees embedded in the continuous hull", () => {
  const parts = merchantShipParts("galleon"),
    hull = parts.find(p => p.id === "hull")!.create(),
    equipment = parts.find(p => p.id === "equipment")!.create();
  hull.group.updateMatrixWorld(true);
  equipment.group.updateMatrixWorld(true);
  const knees = equipment.pickables.filter(mesh => mesh.name === "beakhead-knee");
  expect(knees).toHaveLength(2);
  for (const knee of knees) {
    const a = new THREE.Vector3(0, -0.5, 0).applyMatrix4(knee.matrixWorld),
      b = new THREE.Vector3(0, 0.5, 0).applyMatrix4(knee.matrixWorld);
    const hits = new THREE.Raycaster(a, b.clone().sub(a).normalize(), 0, a.distanceTo(b)).intersectObjects(
      hull.pickables
    );
    expect(hits.length).toBeGreaterThan(0);
  }
  hull.dispose();
  equipment.dispose();
});

it("keeps every port and starboard gunport upright while following the hull normal", () => {
  const ports = galleonGunportMounts();
  for (const model of [
    createGunportFrames(ports),
    createGunportMoving(ports, false),
    createGunportMoving(ports, true)
  ]) {
    for (const port of ports) {
      const group = model.group.getObjectByName(port.id)!;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion);
      const outward = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
      expect(Math.abs(right.y)).toBeLessThan(1e-12);
      expect(up.y).toBeGreaterThan(0.98);
      expect(outward.distanceTo(new THREE.Vector3(...port.normal))).toBeLessThan(1e-12);
    }
    model.dispose();
  }
});
