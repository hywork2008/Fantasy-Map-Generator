import { readFileSync } from "node:fs";
import * as THREE from "three";
import { expect, it } from "vitest";
import { modelParts } from "../modelParts";
import { models } from "./52-dedicated-bakehousesModels";
import { assembleDetachedBakehouse, detachedBakehouseParts } from "./detachedBakehouse";
import { bakehouseFloorHeight, DETACHED_BAKEHOUSE as p } from "./detachedBakehouseProfile";

it("connects every workplace and both site ports through positive-width circulation", async () => {
  const { MEDIEVAL_VARIANTS } = await import("./medievalVariants");
  for (const variant of models[0].variants!)
    expect(MEDIEVAL_VARIANTS.find(v => v.id === variant.id)?.family).toBe(variant.family);
  const routes = p.circulation;
  const reached = new Set<number>([0]);
  for (let pass = 0; pass < routes.length; pass++)
    for (const [i, a] of routes.entries())
      for (const [j, b] of routes.entries()) {
        const r = a.rectXZ,
          s = b.rectXZ;
        if (
          reached.has(i) &&
          Math.min(r[2], s[2]) > Math.max(r[0], s[0]) &&
          Math.min(r[3], s[3]) > Math.max(r[1], s[1])
        )
          reached.add(j);
      }
  expect(reached.size).toBe(routes.length);
  for (const w of p.workplaces)
    expect(
      routes.some(
        ({ rectXZ: r }) =>
          w.centerXZ[0] >= r[0] && w.centerXZ[0] <= r[2] && w.centerXZ[1] >= r[1] && w.centerXZ[1] <= r[3]
      )
    ).toBe(true);
  for (const port of [p.main, p.service])
    expect(
      routes.some(
        ({ rectXZ: r }) =>
          port.position[0] - port.clearWidth / 2 >= r[0] &&
          port.position[0] + port.clearWidth / 2 <= r[2] &&
          port.position[2] >= r[1] &&
          port.position[2] <= r[3]
      )
    ).toBe(true);
});

it("keeps the fixed bread-only contract, planned capacity and explicit CE adoption", () => {
  expect(JSON.parse(JSON.stringify(p))).toEqual(
    JSON.parse(readFileSync("docs/plan/data/ce-dedicated-bakehouse-v1.json", "utf8"))
  );
  expect(p.capacity).toEqual({
    workshops: 1,
    laborPeople: 2.5,
    simultaneousWorkplaces: 3,
    dwellings: 0,
    netResidentialAreaM2: 0
  });
  expect(p.operations.completeOccupationalRow).toBe(false);
  expect(p.operations.throughputVerified).toBe(false);
  expect(models[0].cePlacementStatus).toBeUndefined();
  expect(models[0].variants!.map(v => v.level)).toEqual(["low", "high"]);
});

it.each(["low", "high"] as const)("%s fits all equipment, workplaces and full-width access at unit scale", quality => {
  const factories = detachedBakehouseParts(quality),
    raw = factories.map(f => f.create());
  for (const m of raw) m.group.updateMatrixWorld(true);
  const assembled = assembleDetachedBakehouse(quality);
  try {
    const bounds = new THREE.Box3().setFromObject(assembled.group, true);
    expect(assembled.group.userData.placementSpec).toEqual(p);
    expect(modelParts(assembled.group)).toHaveLength(10);
    for (let axis = 0; axis < 3; axis++) {
      expect(bounds.min.getComponent(axis)).toBeGreaterThanOrEqual(p.envelope.min[axis] - 1e-5);
      expect(bounds.max.getComponent(axis)).toBeLessThanOrEqual(p.envelope.max[axis] + 1e-5);
    }
    for (const reservation of p.equipmentReservations) {
      const index = factories.findIndex(f => f.role === reservation.id),
        b = new THREE.Box3().setFromObject(raw[index].group, true);
      const [x0, z0, x1, z1] = reservation.rectXZ;
      expect(b.min.x, reservation.id).toBeGreaterThanOrEqual(x0 - 1e-5);
      expect(b.max.x, reservation.id).toBeLessThanOrEqual(x1 + 1e-5);
      expect(b.min.z, reservation.id).toBeGreaterThanOrEqual(z0 - 1e-5);
      expect(b.max.z, reservation.id).toBeLessThanOrEqual(z1 + 1e-5);
    }
    const obstacles = raw
      .slice(1)
      .flatMap(m => m.pickables)
      .map(m => new THREE.Box3().setFromObject(m, true));
    const clear = (id: string, rect: readonly number[], height: number) => {
      // Small vertical inset ignores contact with the finished floor, but not furniture or eaves.
      const test = new THREE.Box3(
        new THREE.Vector3(rect[0], 0.17, rect[1]),
        new THREE.Vector3(rect[2], height, rect[3])
      );
      for (const b of obstacles) {
        const intersection = test.clone().intersect(b),
          size = intersection.getSize(new THREE.Vector3());
        expect(size.x * size.y * size.z, id).toBeLessThan(1e-7);
      }
    };
    for (const route of p.circulation) clear(route.id, route.rectXZ, 2.25);
    for (const w of p.workplaces)
      clear(w.id, [w.centerXZ[0] - 0.325, w.centerXZ[1] - 0.325, w.centerXZ[0] + 0.325, w.centerXZ[1] + 0.325], 1.95);
    // The entry is a real opening, not a closed door or a facade painted onto a wall.
    for (const x of [-0.85, 0, 0.85])
      for (const y of [0.3, 1.2, 2.25]) {
        const hits = new THREE.Raycaster(
          new THREE.Vector3(x, y, 3.4),
          new THREE.Vector3(0, 0, -1),
          0,
          0.8
        ).intersectObjects(raw[1].pickables);
        expect(hits).toHaveLength(0);
      }
    for (const z of [4.8, 5.01, 5.5, 6, 6.9]) {
      const hit = new THREE.Raycaster(new THREE.Vector3(0, 1, z), new THREE.Vector3(0, -1, 0), 0, 2).intersectObjects(
        raw[0].pickables
      )[0];
      expect(hit?.point.y).toBeCloseTo(bakehouseFloorHeight(z), 5);
    }
    const stored = raw[factories.findIndex(f => f.role === "stores")];
    for (const item of stored.pickables.filter(m => ["tied-flour-sack", "covered-dough-tray"].includes(m.name))) {
      const b = new THREE.Box3().setFromObject(item, true),
        center = b.getCenter(new THREE.Vector3());
      const hit = new THREE.Raycaster(
        new THREE.Vector3(center.x, b.min.y + 0.001, center.z),
        new THREE.Vector3(0, -1, 0),
        0,
        1
      ).intersectObjects(stored.pickables.filter(m => m.name === "worktop"))[0];
      expect(hit?.point.y).toBeCloseTo(b.min.y, 5);
    }
    const fuel = raw[factories.findIndex(f => f.role === "fuel")];
    expect(new THREE.Box3().setFromObject(fuel.group, true).min.y).toBeCloseTo(p.floorElevation, 5);
    for (const m of raw) expect(m.group.scale.toArray()).toEqual([1, 1, 1]);
  } finally {
    assembled.dispose();
    for (const m of raw) m.dispose();
  }
});

it("keeps the fitted oven, kneading, bread and tool components identical across qualities", () => {
  const low = detachedBakehouseParts("low"),
    high = detachedBakehouseParts("high");
  for (const role of p.equipment.map(e => e.id)) {
    const a = low.find(f => f.role === role)!.create(),
      b = high.find(f => f.role === role)!.create();
    try {
      expect(new THREE.Box3().setFromObject(a.group, true).min.toArray()).toEqual(
        new THREE.Box3().setFromObject(b.group, true).min.toArray()
      );
      expect(new THREE.Box3().setFromObject(a.group, true).max.toArray()).toEqual(
        new THREE.Box3().setFromObject(b.group, true).max.toArray()
      );
      expect(a.pickables.map(m => Array.from(m.geometry.getAttribute("position").array))).toEqual(
        b.pickables.map(m => Array.from(m.geometry.getAttribute("position").array))
      );
    } finally {
      a.dispose();
      b.dispose();
    }
  }
});
