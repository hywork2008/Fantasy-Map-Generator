import * as THREE from "three";
import { expect, it } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import type { CityElement } from "../../city-editor/types/document";
import { createBvInstances, createBvPrototypeCache } from "../../city3d/three/bvInstances";
import { createTownObjects } from "../../city3d/three/objectMeshes";
import { meshProjection } from "../meshProjection";
import { modelParts } from "../modelParts";
import { placementDefinition, placementFootprint } from "../placementModels";
import { models } from "./06-market-stallsModels";

it.each(models)("$id preserves daytime models and fits its distance silhouette inside the saved footprint", model => {
  for (const quality of ["low", "high"] as const) {
    const variant = model.variants!.find(v => v.level === quality)!;
    const original = variant.create();
    const day = model.marketDisplay!.create(variant.id, "ochre", "market-day", "near");
    const far = placementDefinition(model.id, quality, "woad", { detail: "distant" })!.create();
    try {
      expect(collectModelMetrics(day.group)).toEqual(collectModelMetrics(original.group));
      const bounds = new THREE.Box3().setFromObject(far.group, true);
      const footprint = placementFootprint(model.id, quality)!;
      expect(bounds.min.x).toBeGreaterThanOrEqual(footprint.centerX - footprint.halfX - 1e-5);
      expect(bounds.max.x).toBeLessThanOrEqual(footprint.centerX + footprint.halfX + 1e-5);
      expect(bounds.min.z).toBeGreaterThanOrEqual(footprint.centerZ - footprint.halfZ - 1e-5);
      expect(bounds.max.z).toBeLessThanOrEqual(footprint.centerZ + footprint.halfZ + 1e-5);
      expect(bounds.min.y).toBeCloseTo(footprint.groundY, 5);
      expect(collectModelMetrics(far.group).triangles).toBeLessThan(256);
      if (model.id === "market-goods-booth" || model.id === "market-fish-booth") {
        far.group.updateMatrixWorld(true);
        const roof = new THREE.Raycaster(
          new THREE.Vector3(footprint.centerX + 0.43, 5, footprint.centerZ + 0.47),
          new THREE.Vector3(0, -1, 0)
        ).intersectObjects(far.pickables)[0];
        expect(roof.point.y).toBeGreaterThan(2.5);
        expect(roof.face!.normal.y).toBeGreaterThan(0);
      }
      if (model.id !== "market-fish-booth") {
        expect(placementDefinition(model.id, quality, undefined, { activity: "closed" })).toBeNull();
        const packed = model.marketDisplay!.create(variant.id, "ochre", "closed", "near");
        try {
          for (const view of ["side", "top"] as const) expect(meshProjection(packed, view)).not.toMatch(/Infinity|NaN/);
        } finally {
          packed.dispose();
        }
      }
    } finally {
      original.dispose();
      day.dispose();
      far.dispose();
    }
  }
});

it("closes the permanent booth with shutters and clears its goods and stock", () => {
  const model = placementDefinition("market-fish-booth", "high", "madder", { activity: "closed" })!.create();
  try {
    expect(modelParts(model.group).map(p => p.id)).toEqual(["stall-shell"]);
    model.group.updateMatrixWorld(true);
    const shutter = new THREE.Raycaster(new THREE.Vector3(0.125, 1.6, 2), new THREE.Vector3(0, 0, -1), 0, 1);
    expect(shutter.intersectObjects(model.pickables).length).toBeGreaterThan(0);
    const stock = new THREE.Raycaster(new THREE.Vector3(-1.15, 1.4, -0.7), new THREE.Vector3(0, -1, 0), 0, 1.3);
    expect(stock.intersectObjects(model.pickables)).toHaveLength(0);
  } finally {
    model.dispose();
  }
});

it("compacts instance picking after visibility changes and releases the shared prototype", () => {
  const cache = createBvPrototypeCache();
  const definition = placementDefinition("market-fish-table", "high")!;
  const sites = [0, 1, 2].map(i => ({
    id: String(i),
    definition,
    matrix: new THREE.Matrix4().makeTranslation(i * 20, 0, 0)
  }));
  const layer = createBvInstances(sites, cache);
  expect(layer.setVisible(site => site.id === "2")).toBe(true);
  expect(layer.pickables[0].count).toBe(1);
  expect(layer.resolve({ object: layer.pickables[0], instanceId: 0 })?.id).toBe("2");
  expect(layer.setVisible(site => site.id === "2")).toBe(false);
  layer.setVisible(() => true);
  expect(layer.pickables[0].count).toBe(3);
  expect(layer.resolve({ object: layer.pickables[0], instanceId: 1 })?.id).toBe("1");
  layer.dispose();
  expect(cache.size).toBe(0);
});

it("switches each market pitch by projected size, restores the saved High tier nearby, and releases both tiers", () => {
  const cache = createBvPrototypeCache();
  const elements: CityElement[] = [0, 1].map(i => ({
    id: String(i),
    kind: "object",
    faceIds: [],
    locked: false,
    point: [i * 800, 0],
    objectType: "market-bread-stall",
    objectQuality: "high",
    objectPalette: "madder"
  }));
  const before = JSON.stringify(elements);
  const layer = createTownObjects(elements, () => 4, cache, { lod: true });
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
  camera.position.set(0, 8, 15);
  expect(layer.update(camera, 1000)).toBe(true);
  const near = layer.pickables.find(m => !m.name.includes("distant"))!;
  const far = layer.pickables.find(m => m.name.includes("distant"))!;
  expect(near.count).toBe(1);
  expect(far.count).toBe(1);
  expect(layer.resolve({ object: near, instanceId: 0 })?.id).toBe("0");
  expect(layer.resolve({ object: far, instanceId: 0 })?.id).toBe("1");
  camera.position.set(800, 8, 15);
  layer.update(camera, 1000);
  expect(layer.resolve({ object: near, instanceId: 0 })?.id).toBe("1");
  camera.position.set(400, 1000, 2000);
  layer.update(camera, 1000);
  expect(near.count).toBe(0);
  expect(far.count).toBe(2);
  expect(JSON.stringify(elements)).toBe(before);
  layer.dispose();
  expect(cache.size).toBe(0);
});
