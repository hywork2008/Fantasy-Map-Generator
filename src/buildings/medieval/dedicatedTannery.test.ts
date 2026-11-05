import { readFileSync } from "node:fs";
import * as THREE from "three";
import { expect, it } from "vitest";
import { models } from "./55-dedicated-tanneriesModels";
import { assembleDedicatedTannery, dedicatedTanneryParts } from "./dedicatedTannery";
import { DEDICATED_TANNERY as p } from "./dedicatedTanneryProfile";

it("keeps the spatial proposal separate from CE adoption and verified water or production", () => {
  expect(JSON.parse(readFileSync("docs/plan/data/ce-dedicated-tannery-v1.json", "utf8")).form).toEqual(p);
  expect(models[0].cePlacementStatus).toBeUndefined();
  expect(p.water.externalConnectionVerified).toBe(false);
  expect(p.water.flowRateVerified).toBe(false);
  expect(p.capacity.verifiedProductionCapacity).toBeNull();
  expect(p.capacity.dwellings).toBe(0);
});
it.each(["low", "high"] as const)(
  "%s keeps equipment, workspaces, connected goods routes and separate water corridors clear",
  quality => {
    const factories = dedicatedTanneryParts(quality),
      raw = factories.map(f => f.create()),
      model = assembleDedicatedTannery(quality);
    try {
      for (const m of raw) m.group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model.group, true);
      for (let i = 0; i < 3; i++) {
        expect(bounds.min.getComponent(i)).toBeGreaterThanOrEqual(p.envelope.min[i] - 1e-5);
        expect(bounds.max.getComponent(i)).toBeLessThanOrEqual(p.envelope.max[i] + 1e-5);
      }
      for (const c of p.componentBounds) {
        const b = new THREE.Box3().setFromObject(raw[factories.findIndex(f => f.role === c.id)].group, true);
        for (const [v, limit] of [
          [b.min.x, c.rectXZ[0]],
          [b.min.z, c.rectXZ[1]]
        ])
          expect(v, c.id).toBeGreaterThanOrEqual(limit - 1e-5);
        for (const [v, limit] of [
          [b.max.x, c.rectXZ[2]],
          [b.max.z, c.rectXZ[3]]
        ])
          expect(v, c.id).toBeLessThanOrEqual(limit + 1e-5);
      }
      const solids = raw
        .slice(1)
        .flatMap(m => m.pickables)
        .map(m => new THREE.Box3().setFromObject(m, true));
      const clear = (r: readonly number[], name: string) => {
        const body = new THREE.Box3(new THREE.Vector3(r[0], 0.07, r[1]), new THREE.Vector3(r[2], 2.2, r[3]));
        for (const b of solids) {
          const s = body.clone().intersect(b).getSize(new THREE.Vector3());
          expect(s.x * s.y * s.z, name).toBeLessThan(1e-7);
        }
      };
      for (const r of p.circulation) clear(r.rectXZ, r.id);
      for (const w of [...p.workplaces, ...p.alternateOperatingPositions, ...p.stockHandlingPositions]) {
        const [x, z] = w.centerXZ;
        clear([x - 0.325, z - 0.325, x + 0.325, z + 0.325], w.id);
        expect(
          p.circulation.some(
            ({ rectXZ: r }) => x - 0.325 >= r[0] && z - 0.325 >= r[1] && x + 0.325 <= r[2] && z + 0.325 <= r[3]
          )
        ).toBe(true);
      }
      for (const stock of p.stockHandlingPositions) {
        const distance = Math.hypot(
          stock.centerXZ[0] - stock.pickupEdgeXZ[0],
          stock.centerXZ[1] - stock.pickupEdgeXZ[1]
        );
        expect(distance - 0.325, stock.id).toBeLessThanOrEqual(p.stockHandlingReachFromBodyEdge);
      }
      const reached = new Set([0]);
      for (let pass = 0; pass < p.circulation.length; pass++)
        for (const [i, a] of p.circulation.entries())
          for (const [j, b] of p.circulation.entries())
            if (
              reached.has(i) &&
              Math.min(a.rectXZ[2], b.rectXZ[2]) > Math.max(a.rectXZ[0], b.rectXZ[0]) &&
              Math.min(a.rectXZ[3], b.rectXZ[3]) > Math.max(a.rectXZ[1], b.rectXZ[1])
            )
              reached.add(j);
      expect(reached.size).toBe(p.circulation.length);
      // Swept folded-hide/pail envelope along the central entrance and wet-work frontage.
      for (let z = 0; z <= 7.6; z += 0.2) clear([-0.4, z - 0.4, 0.4, z + 0.4], "hand-carried entry");
      for (let x = -7.5; x <= 7.5; x += 0.2) clear([x - 0.4, -1.65, x + 0.4, -0.85], "wet-work transfer");
      for (const x of [-7.5, 7.5]) {
        const channels = raw[factories.findIndex(f => f.role === "water-channels")];
        const hit = new THREE.Raycaster(new THREE.Vector3(x, 2, -7), new THREE.Vector3(0, -1, 0)).intersectObjects(
          channels.pickables
        )[0];
        expect(hit.point.y).toBeCloseTo(0.31, 5);
      }
      const vats = raw[factories.findIndex(f => f.role === "wet-process")];
      for (const x of [-2, 1, 4]) {
        const hit = new THREE.Raycaster(new THREE.Vector3(x, 2, -3), new THREE.Vector3(0, -1, 0)).intersectObjects(
          vats.pickables
        )[0];
        expect(hit.point.y).toBeCloseTo(0.795, 5);
      }
    } finally {
      model.dispose();
      for (const m of raw) m.dispose();
    }
  }
);
it("shares full-size equipment between qualities with independent resources", () => {
  const a = dedicatedTanneryParts("low"),
    b = dedicatedTanneryParts("high");
  for (let i = 2; i < a.length; i++) {
    const x = a[i].create(),
      y = b[i].create();
    try {
      expect(x.pickables.map(m => Array.from(m.geometry.getAttribute("position").array))).toEqual(
        y.pickables.map(m => Array.from(m.geometry.getAttribute("position").array))
      );
      expect(x.pickables[0].geometry).not.toBe(y.pickables[0].geometry);
      expect(x.group.scale.toArray()).toEqual([1, 1, 1]);
    } finally {
      x.dispose();
      y.dispose();
    }
  }
});
