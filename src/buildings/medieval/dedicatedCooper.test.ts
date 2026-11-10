import { readFileSync } from "node:fs";
import * as THREE from "three";
import { expect, it } from "vitest";
import { modelParts } from "../modelParts";
import { models } from "./54-dedicated-cooperageModels";
import { assembleDedicatedCooper, dedicatedCooperParts } from "./dedicatedCooper";
import { cooperFloorHeight, DEDICATED_COOPER as p } from "./dedicatedCooperProfile";

it("keeps a versioned spatial study distinct from verified production and CE reservations", () => {
  const fixed = JSON.parse(readFileSync("docs/plan/data/ce-dedicated-cooperage-v1.json", "utf8"));
  expect(p).toEqual(fixed.form);
  expect(models[0].cePlacementStatus).toBeUndefined();
  expect(p.capacity.workshops).toBe(1);
  expect(p.capacity.simultaneousWorkplaces).toBe(3);
  expect(p.capacity.dwellings).toBe(0);
  expect(p.operations.throughputVerified).toBe(false);
  expect(p.operations.longTermSeasoningOnSite).toBe(false);
});
it.each(["low", "high"] as const)(
  "%s fits the shared envelope and keeps people and empty-cask handling clear",
  quality => {
    const factories = dedicatedCooperParts(quality),
      raw = factories.map(f => f.create()),
      assembled = assembleDedicatedCooper(quality);
    for (const m of raw) m.group.updateMatrixWorld(true);
    try {
      expect(modelParts(assembled.group)).toHaveLength(9);
      const box = new THREE.Box3().setFromObject(assembled.group, true);
      for (let i = 0; i < 3; i++) {
        expect(box.min.getComponent(i)).toBeGreaterThanOrEqual(p.envelope.min[i] - 1e-5);
        expect(box.max.getComponent(i)).toBeLessThanOrEqual(p.envelope.max[i] + 1e-5);
      }
      for (const c of p.componentBounds) {
        const b = new THREE.Box3().setFromObject(raw[factories.findIndex(f => f.role === c.id)].group, true);
        expect(b.min.x, c.id).toBeGreaterThanOrEqual(c.rectXZ[0] - 1e-5);
        expect(b.min.z, c.id).toBeGreaterThanOrEqual(c.rectXZ[1] - 1e-5);
        expect(b.max.x, c.id).toBeLessThanOrEqual(c.rectXZ[2] + 1e-5);
        expect(b.max.z, c.id).toBeLessThanOrEqual(c.rectXZ[3] + 1e-5);
      }
      const solids = raw
        .slice(1)
        .flatMap(m => m.pickables)
        .map(m => new THREE.Box3().setFromObject(m, true));
      const clear = (r: readonly number[], height: number, id: string) => {
        const body = new THREE.Box3(new THREE.Vector3(r[0], 0.14, r[1]), new THREE.Vector3(r[2], height, r[3]));
        for (const b of solids) {
          const size = body.clone().intersect(b).getSize(new THREE.Vector3());
          expect(size.x * size.y * size.z, id).toBeLessThan(1e-7);
        }
      };
      for (const route of p.circulation) clear(route.rectXZ, 2.35, route.id);
      for (const w of [
        ...p.workplaces,
        p.operations.alternateHeatWorkplace,
        p.operations.alternateShapingWorkplace,
        p.operations.alternateHeadingWorkplace
      ])
        clear(
          [w.centerXZ[0] - 0.325, w.centerXZ[1] - 0.325, w.centerXZ[0] + 0.325, w.centerXZ[1] + 0.325],
          1.92,
          "worker"
        );
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
      for (const port of p.ports)
        expect(
          p.circulation.some(
            ({ rectXZ: r }) =>
              port.position[0] - port.clearWidth / 2 >= r[0] - 1e-5 &&
              port.position[0] + port.clearWidth / 2 <= r[2] + 1e-5 &&
              port.position[2] >= r[1] &&
              port.position[2] <= r[3]
          ),
          port.id
        ).toBe(true);
      const payload = (x: number, z: number) => clear([x - 0.65, z - 0.65, x + 0.65, z + 0.65], 1.52, "empty cask");
      for (let x = 1.7; x <= 4.5; x += 0.1) {
        payload(x, 2.5);
        clear([x - 0.325, 0.925, x + 0.325, 1.575], 1.92, "horizontal handler");
      }
      for (let z = 2.5; z <= 6.3; z += 0.1) {
        payload(1.7, z);
        clear([2.625, z - 0.325, 3.275, z + 0.325], 1.92, "front handler");
      }
      for (let i = 0; i <= 18; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 36,
          x = 1.7 + Math.cos(a) * 1.25,
          z = 2.5 + Math.sin(a) * 1.25;
        clear([x - 0.325, z - 0.325, x + 0.325, z + 0.325], 1.92, "turning handler");
        expect(
          Math.hypot(Math.max(Math.abs(x - 1.7) - 0.325, 0), Math.max(Math.abs(z - 2.5) - 0.325, 0))
        ).toBeGreaterThan(0.65);
      }
      for (const [x, z, y] of [
        [-5.7, 1.7, 1.02],
        [-5.6, -2.25, 0.97],
        [0, -2, 0.57]
      ]) {
        assembled.group.updateMatrixWorld(true);
        const hit = new THREE.Raycaster(
          new THREE.Vector3(x, 2.5, z),
          new THREE.Vector3(0, -1, 0),
          0,
          3
        ).intersectObjects(assembled.pickables)[0];
        expect(hit?.point.y).toBeCloseTo(y, 5);
      }
      for (const z of [4.9, 5.1, 6, 6.8]) {
        const hit = new THREE.Raycaster(new THREE.Vector3(0, 1, z), new THREE.Vector3(0, -1, 0), 0, 2).intersectObjects(
          raw[0].pickables
        )[0];
        expect(hit?.point.y).toBeCloseTo(cooperFloorHeight(z), 5);
      }
    } finally {
      assembled.dispose();
      for (const m of raw) m.dispose();
    }
  }
);
it("uses identical full-size equipment in both qualities", () => {
  const a = dedicatedCooperParts("low"),
    b = dedicatedCooperParts("high");
  for (let i = 2; i < a.length; i++) {
    const x = a[i].create(),
      y = b[i].create();
    try {
      expect(x.group.scale.toArray()).toEqual([1, 1, 1]);
      expect(x.pickables.map(m => Array.from(m.geometry.getAttribute("position").array))).toEqual(
        y.pickables.map(m => Array.from(m.geometry.getAttribute("position").array))
      );
    } finally {
      x.dispose();
      y.dispose();
    }
  }
});
