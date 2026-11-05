import { readFileSync } from "node:fs";
import * as THREE from "three";
import { expect, it } from "vitest";
import { modelParts } from "../modelParts";
import { models } from "./53-dedicated-smithiesModels";
import { assembleDedicatedSmithy, dedicatedSmithyParts } from "./dedicatedSmithy";
import { type DedicatedSmithyForm, dedicatedSmithyProfile, smithyFloorHeight } from "./dedicatedSmithyProfile";

it("keeps two distinct immutable forms without doubling the calibrated smithing pool", () => {
  const fixed = JSON.parse(readFileSync("docs/plan/data/ce-dedicated-smithies-v1.json", "utf8"));
  expect([dedicatedSmithyProfile("smithy"), dedicatedSmithyProfile("farrier")]).toEqual(fixed.forms);
  expect(models).toHaveLength(2);
  const farrier = dedicatedSmithyProfile("farrier");
  expect(farrier.ports.find(p => p.id === "animal-front")?.normalXZ).toEqual([0, 1]);
  expect(farrier.ports.find(p => p.id === "animal-rear")?.normalXZ).toEqual([0, -1]);
  for (const m of models) {
    expect(m.variants!.map(v => v.level)).toEqual(["low", "high"]);
    expect(m.cePlacementStatus).toBeUndefined();
  }
  for (const form of ["smithy", "farrier"] as const) {
    const p = dedicatedSmithyProfile(form);
    expect(p.capacity).toEqual({
      workshops: 1,
      laborPeople: 2.5,
      simultaneousWorkplaces: 3,
      dwellings: 0,
      netResidentialAreaM2: 0
    });
    expect(p.operations.completeOccupationalRow).toBe(false);
    expect(p.operations.throughputVerified).toBe(false);
  }
});

it.each(
  (["smithy", "farrier"] as const).flatMap(form => (["low", "high"] as const).map(quality => ({ form, quality })))
)("$form/$quality contains actual equipment, empty workplaces and connected human access", ({ form, quality }) => {
  const p = dedicatedSmithyProfile(form),
    factories = dedicatedSmithyParts(form, quality),
    raw = factories.map(f => f.create());
  for (const m of raw) m.group.updateMatrixWorld(true);
  const assembled = assembleDedicatedSmithy(form, quality);
  try {
    const box = new THREE.Box3().setFromObject(assembled.group, true);
    expect(modelParts(assembled.group)).toHaveLength(form === "farrier" ? 9 : 8);
    expect(assembled.group.userData.placementSpec).toEqual(p);
    for (let i = 0; i < 3; i++) {
      expect(box.min.getComponent(i)).toBeGreaterThanOrEqual(p.envelope.min[i] - 1e-5);
      expect(box.max.getComponent(i)).toBeLessThanOrEqual(p.envelope.max[i] + 1e-5);
    }
    for (const r of p.componentBounds) {
      const part = raw[factories.findIndex(f => f.role === r.id)],
        b = new THREE.Box3().setFromObject(part.group, true);
      expect(b.min.x, r.id).toBeGreaterThanOrEqual(r.rectXZ[0] - 1e-5);
      expect(b.min.z, r.id).toBeGreaterThanOrEqual(r.rectXZ[1] - 1e-5);
      expect(b.max.x, r.id).toBeLessThanOrEqual(r.rectXZ[2] + 1e-5);
      expect(b.max.z, r.id).toBeLessThanOrEqual(r.rectXZ[3] + 1e-5);
    }
    const solids = raw
      .slice(1)
      .flatMap(m => m.pickables)
      .map(m => new THREE.Box3().setFromObject(m, true));
    const clear = (r: readonly number[], height: number, id: string) => {
      const volume = new THREE.Box3(new THREE.Vector3(r[0], 0.17, r[1]), new THREE.Vector3(r[2], height, r[3]));
      for (const b of solids) {
        const size = volume.clone().intersect(b).getSize(new THREE.Vector3());
        expect(size.x * size.y * size.z, id).toBeLessThan(1e-7);
      }
    };
    for (const route of p.circulation) clear(route.rectXZ, 2.35, route.id);
    for (const w of p.workplaces)
      clear(
        [w.centerXZ[0] - 0.325, w.centerXZ[1] - 0.325, w.centerXZ[0] + 0.325, w.centerXZ[1] + 0.325],
        0.15 + w.height,
        w.id
      );
    const routes = p.circulation,
      reached = new Set([0]);
    for (let pass = 0; pass < routes.length; pass++)
      for (const [i, a] of routes.entries())
        for (const [j, b] of routes.entries())
          if (
            reached.has(i) &&
            Math.min(a.rectXZ[2], b.rectXZ[2]) > Math.max(a.rectXZ[0], b.rectXZ[0]) &&
            Math.min(a.rectXZ[3], b.rectXZ[3]) > Math.max(a.rectXZ[1], b.rectXZ[1])
          )
            reached.add(j);
    expect(reached.size).toBe(routes.length);
    for (const w of p.workplaces)
      expect(
        routes.some(
          ({ rectXZ: r }) =>
            w.centerXZ[0] >= r[0] && w.centerXZ[0] <= r[2] && w.centerXZ[1] >= r[1] && w.centerXZ[1] <= r[3]
        ),
        w.id
      ).toBe(true);
    for (const port of p.ports) {
      const candidates = port.id.startsWith("animal") && p.animal ? [{ rectXZ: p.animal.travelXZ }] : routes;
      expect(
        candidates.some(
          ({ rectXZ: r }) =>
            port.position[0] - port.clearWidth / 2 >= r[0] - 1e-6 &&
            port.position[0] + port.clearWidth / 2 <= r[2] + 1e-6 &&
            port.position[2] >= r[1] &&
            port.position[2] <= r[3]
        ),
        port.id
      ).toBe(true);
    }
    for (const z of form === "farrier" ? [-6.8, -6, -5.1, 4.9, 6, 6.8] : [3.9, 4.1, 5, 5.8]) {
      const hit = new THREE.Raycaster(new THREE.Vector3(0, 1, z), new THREE.Vector3(0, -1, 0), 0, 2).intersectObjects(
        raw[0].pickables
      )[0];
      expect(hit?.point.y).toBeCloseTo(smithyFloorHeight(form, z), 5);
    }
    // A real open flue includes the reused roof cut, rather than a solid cap or tile.
    expect(
      new THREE.Raycaster(new THREE.Vector3(-2, 5.85, -2.1), new THREE.Vector3(0, -1, 0), 0, 4.1).intersectObjects(
        raw.flatMap(m => m.pickables)
      )
    ).toHaveLength(0);
    if (p.animal) {
      for (let z = -5.5; z <= 5.5; z += 0.25) clear([6.5, z - 1.3, 7.5, z + 1.3], 2.55, "horse travel body");
      clear(p.animal.travelXZ, 2.75, "full animal passage");
      const h = p.operations.hotEquipmentExclusionXZ;
      expect(h[2]).toBeLessThan(p.animal.travelXZ[0]);
      expect(p.operations.hotMetalTransferXZ[2]).toBeLessThan(p.animal.travelXZ[0]);
      const animal = new THREE.Box3(new THREE.Vector3(6.5, 0.17, -1.3), new THREE.Vector3(7.5, 2.55, 1.3));
      for (const w of p.workplaces) {
        const body = new THREE.Box3(
          new THREE.Vector3(w.centerXZ[0] - 0.325, 0.17, w.centerXZ[1] - 0.325),
          new THREE.Vector3(w.centerXZ[0] + 0.325, 0.15 + w.height, w.centerXZ[1] + 0.325)
        );
        const size = body.intersect(animal).getSize(new THREE.Vector3());
        expect(size.x * size.y * size.z, w.id).toBe(0);
      }
      expect(p.animal.frontAndRearExternalContinuationRequired).toBe(true);
      expect(p.animal.hoofMotionAndRestraintVerified).toBe(false);
    }
  } finally {
    assembled.dispose();
    for (const m of raw) m.dispose();
  }
});
it.each(["smithy", "farrier"] as DedicatedSmithyForm[])(
  "%s reuses full-size equipment identically across qualities",
  form => {
    const low = dedicatedSmithyParts(form, "low"),
      high = dedicatedSmithyParts(form, "high");
    for (const role of ["roof", "forge", "bellows", "anvil", "tools"]) {
      const a = low.find(f => f.role === role)!.create(),
        b = high.find(f => f.role === role)!.create();
      try {
        expect(new THREE.Box3().setFromObject(a.group, true).min.toArray()).toEqual(
          new THREE.Box3().setFromObject(b.group, true).min.toArray()
        );
        expect(a.pickables.map(m => Array.from(m.geometry.getAttribute("position").array))).toEqual(
          b.pickables.map(m => Array.from(m.geometry.getAttribute("position").array))
        );
        expect(a.group.scale.toArray()).toEqual([1, 1, 1]);
      } finally {
        a.dispose();
        b.dispose();
      }
    }
  }
);
