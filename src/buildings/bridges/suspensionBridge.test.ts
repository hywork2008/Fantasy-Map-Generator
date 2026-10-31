import * as THREE from "three";
import { expect, it } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { createSuspensionBridge, type SuspensionBridgeSpec } from "./suspensionBridge";

const spec: SuspensionBridgeSpec = { length: 48, width: 2.6, deckHeight: 2, waterHeight: -18 };

it("keeps the river span clear beneath the deck, with supports and anchors confined to the banks", () => {
  const model = createSuspensionBridge(spec);
  model.group.updateMatrixWorld(true);
  for (const x of [-20, -8, 0, 8, 20]) {
    const hits = new THREE.Raycaster(new THREE.Vector3(x, 1, 20), new THREE.Vector3(0, 0, -1)).intersectObjects(
      model.pickables,
      false
    );
    expect(hits).toHaveLength(0);
  }
  const masonry = model.group.getObjectByName("suspension-bank-masonry") as THREE.Mesh;
  const positions = masonry.geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) expect(Math.abs(positions.getX(i))).toBeGreaterThanOrEqual(spec.length / 2);
  model.dispose();
});

it("fits unequal bank heights without scaling and retains the suspension silhouette at low quality", () => {
  const graded = { ...spec, endDeckHeight: 5 };
  const high = createSuspensionBridge(graded),
    low = createSuspensionBridge(graded, "low");
  high.group.updateMatrixWorld(true);
  const pitch = spec.length / Math.ceil(spec.length / 0.28);
  for (const index of [0, 48, 90, 170]) {
    const x = -spec.length / 2 + (index + 0.5) * pitch;
    const hit = new THREE.Raycaster(new THREE.Vector3(x, 30, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(
      high.pickables,
      false
    )[0];
    expect(hit.point.y).toBeCloseTo(2 + ((x + spec.length / 2) * 3) / spec.length, 2);
  }
  const boundsHigh = new THREE.Box3().setFromObject(high.group),
    boundsLow = new THREE.Box3().setFromObject(low.group);
  expect(boundsHigh.min.distanceTo(boundsLow.min)).toBeLessThan(0.05);
  expect(boundsHigh.max.distanceTo(boundsLow.max)).toBeLessThan(0.05);
  expect(high.group.scale.toArray()).toEqual([1, 1, 1]);
  expect(collectModelMetrics(high.group).meshes).toBe(4);
  expect(collectModelMetrics(low.group).triangles).toBeLessThan(collectModelMetrics(high.group).triangles / 2);
  high.dispose();
  low.dispose();
});

it.each([{ length: Number.NaN }, { width: 0 }, { waterHeight: 2 }, { endDeckHeight: 30 }])(
  "rejects unsafe or nonfinite dimensions: %o",
  invalid => {
    expect(() => createSuspensionBridge({ ...spec, ...invalid })).toThrow(RangeError);
  }
);
