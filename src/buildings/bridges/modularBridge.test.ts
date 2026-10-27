import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { meshProjection } from "../meshProjection";
import { createModularBridge, type ModularBridgeSpec } from "./modularBridge";

const spec: ModularBridgeSpec = { material: "stone", length: 36, width: 6, deckHeight: 8, waterHeight: 2 };
it("extends to a kilometre with repeated buffers and a bounded number of draw calls", () => {
  const short = createModularBridge(spec),
    long = createModularBridge({ ...spec, length: 1000 });
  expect(long.bayCount).toBe(84);
  const a = collectModelMetrics(short.group),
    b = collectModelMetrics(long.group);
  expect(b.geometries).toBe(a.geometries);
  expect(b.meshes).toBe(a.meshes);
  expect(b.meshes).toBeLessThanOrEqual(3);
  expect(b.triangles).toBeGreaterThan(a.triangles * 20);
  const bounds = new THREE.Box3().setFromObject(long.group);
  expect(bounds.min.x).toBeCloseTo(-500, 4);
  expect(bounds.max.x).toBeCloseTo(500, 4);
  short.dispose();
  long.dispose();
});
it("keeps arch openings open across the full river-facing thickness", () => {
  const model = createModularBridge(spec);
  model.group.updateMatrixWorld(true);
  const through = (x: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 6.5, 20), new THREE.Vector3(0, 0, -1)).intersectObjects(
      model.pickables,
      false
    );
  expect(through(0)).toHaveLength(0);
  expect(through(6).length).toBeGreaterThan(0);
  const roof = new THREE.Raycaster(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(
    model.pickables,
    false
  )[0];
  expect(roof.point.y).toBeCloseTo(8);
  expect(roof.face!.normal.y).toBeGreaterThan(0.99);
  model.dispose();
});
it("fits exact non-multiple lengths and follows both bank heights without bending in plan", () => {
  const model = createModularBridge({ ...spec, length: 101.3, endDeckHeight: 10 });
  model.group.updateMatrixWorld(true);
  for (const x of [-50.64, -18, 0, 28, 50.64]) {
    const hit = new THREE.Raycaster(new THREE.Vector3(x, 30, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(
      model.pickables,
      false
    )[0];
    expect(hit.point.y).toBeCloseTo(8 + ((x + 50.65) / 101.3) * 2, 3);
  }
  model.dispose();
});
it("leaves the movable navigation opening free of intermediate piers and shows closed lifting leaves", () => {
  const model = createModularBridge({ ...spec, length: 96, movableOpeningMeters: 12 });
  model.group.updateMatrixWorld(true);
  const through = new THREE.Raycaster(new THREE.Vector3(0, 5, 20), new THREE.Vector3(0, 0, -1)).intersectObjects(
    model.pickables,
    false
  );
  expect(through).toHaveLength(0);
  const deck = new THREE.Raycaster(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(
    model.pickables,
    false
  )[0];
  expect(deck.point.y).toBeCloseTo(8);
  expect(model.group.getObjectByName("bridge-lifting-gear")).toBeTruthy();
  model.dispose();
});
it("projects every repeated bay in BV and releases each owned resource once", () => {
  const model = createModularBridge({ ...spec, material: "timber" });
  const drawing = meshProjection(model, "side");
  expect(drawing).not.toMatch(/NaN|Infinity/);
  expect(drawing).toContain("17.");
  const geometries = [...new Set(model.pickables.map(mesh => mesh.geometry))];
  const materials = [...new Set(model.pickables.flatMap(mesh => mesh.material))];
  const spies = [...geometries, ...materials].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const dispose of spies) expect(dispose).toHaveBeenCalledOnce();
});
it("retains low-quality silhouettes while omitting high-quality stone joints and timber details", () => {
  for (const material of ["stone", "timber"] as const) {
    const high = createModularBridge({ ...spec, material }),
      low = createModularBridge({ ...spec, material }, "low");
    expect(collectModelMetrics(low.group).triangles).toBeLessThan(collectModelMetrics(high.group).triangles);
    const a = new THREE.Box3().setFromObject(high.group),
      b = new THREE.Box3().setFromObject(low.group);
    expect(a.min.x).toBeCloseTo(b.min.x, 4);
    expect(a.max.y).toBeCloseTo(b.max.y, 1);
    high.dispose();
    low.dispose();
  }
});
