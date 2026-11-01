import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { adoptedVariant } from "../../city3d/adoption";
import { type ModelPartRange, modelParts } from "../modelParts";
import { CEMETERY_VARIANTS } from "../siteVariants";
import { models } from "./44-cemetery-facilitiesModels";
import { STUPA_PROFILE, stupaPartFactories } from "./stupaParts";

const definition = models.find(m => m.id === "stupa-chorten")!;
it("keeps the original Low and default while registering explicit chorten High", () => {
  expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
  expect(adoptedVariant("cemetery.stupa_chorten", "high").id).toBe(definition.variants![1].id);
  for (const variant of CEMETERY_VARIANTS.filter(v => v.family === "cemetery.stupa_chorten" && v.level !== "high")) {
    const model = variant.create();
    try {
      expect(landmarkFingerprint(model.group)).toBe("c10347f4a370a84dc46f9cf69af50df8e0c5e5d82cffc6664c7bb051639519a3");
    } finally {
      model.dispose();
    }
  }
});

it("grounds the throne and supports every fitted upper component without a custom mounting hole", () => {
  const parts = stupaPartFactories().map(p => p.create());
  try {
    const boxes = parts.map(p => new THREE.Box3().setFromObject(p.group));
    expect(boxes[0].min.y).toBeCloseTo(0);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].min.y).toBeLessThanOrEqual(boxes[i - 1].max.y + 1e-6);
    expect(boxes[0].max.y).toBeCloseTo(STUPA_PROFILE.throneTop);
    expect(boxes[1].max.y).toBeCloseTo(STUPA_PROFILE.terraceTop);
    expect(boxes[2].max.y).toBeCloseTo(STUPA_PROFILE.bumpaTop);
    expect(boxes[3].max.y).toBeCloseTo(STUPA_PROFILE.harmikaTop);
    const body = parts[2];
    body.group.updateMatrixWorld(true);
    const hit = new THREE.Raycaster(new THREE.Vector3(0, 2.7, 5), new THREE.Vector3(0, 0, -1)).intersectObjects(
      body.pickables
    )[0];
    expect(hit.point.z).toBeGreaterThan(1.4);
  } finally {
    for (const p of parts) p.dispose();
  }
});

it("uses thirteen decreasing spire rings connected by one continuous core", () => {
  const model = stupaPartFactories()
    .find(p => p.role === "spire")!
    .create();
  try {
    const rings = model.pickables.filter(m => m.name === "tapering-spire-ring");
    expect(rings).toHaveLength(13);
    const core = new THREE.Box3().setFromObject(model.pickables.find(m => m.name === "continuous-spire-core")!);
    let width = Infinity,
      y = -Infinity;
    for (const ring of rings) {
      const box = new THREE.Box3().setFromObject(ring),
        size = box.getSize(new THREE.Vector3());
      expect(size.x).toBeLessThan(width);
      expect(box.min.y).toBeGreaterThan(y);
      expect(box.intersectsBox(core)).toBe(true);
      width = size.x;
      y = box.min.y;
    }
  } finally {
    model.dispose();
  }
});

it("leaves the crescent open and physically connects the parasol, moon, sun and jewel", () => {
  const model = stupaPartFactories()
    .find(p => p.role === "crown")!
    .create();
  try {
    model.group.updateMatrixWorld(true);
    const axis = new THREE.Box3().setFromObject(model.pickables.find(m => m.name === "continuous-crown-axis")!);
    for (const name of ["parasol-canopy", "open-crescent-moon", "sun-disc", "crown-jewel"])
      expect(new THREE.Box3().setFromObject(model.pickables.find(m => m.name === name)!).intersectsBox(axis)).toBe(
        true
      );
    const moon = model.pickables.find(m => m.name === "open-crescent-moon")!;
    expect(
      new THREE.Raycaster(new THREE.Vector3(0, 6.86, 1), new THREE.Vector3(0, 0, -1)).intersectObject(moon)
    ).toHaveLength(0);
    expect(
      new THREE.Raycaster(new THREE.Vector3(0, 6.69, 1), new THREE.Vector3(0, 0, -1)).intersectObject(moon).length
    ).toBeGreaterThan(0);
    expect(new THREE.Box3().setFromObject(model.group).max.y).toBeCloseTo(STUPA_PROFILE.crownTop);
  } finally {
    model.dispose();
  }
});

it("keeps six independently selectable High parts bounded, finite and independently disposable", () => {
  const high = definition.variants![1],
    first = high.create(),
    second = high.create(),
    parts = definition.parts!(high.id);
  try {
    expect(parts.map(p => p.role)).toEqual(["throne", "terraces", "bumpa", "harmika", "spire", "crown"]);
    expect(parts.every(p => p.quality === "high")).toBe(true);
    const size = new THREE.Box3().setFromObject(first.group).getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(definition.size[0]);
    expect(size.z).toBeLessThan(definition.size[1]);
    expect(size.y).toBeLessThan(definition.size[2]);
    expect(collectModelMetrics(first.group).triangles).toBeLessThan(12000);
    expect(collectModelMetrics(first.group).meshes).toBeLessThanOrEqual(6);
    const counts = new Map<string, number>();
    for (const mesh of first.pickables) {
      for (const name of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
      let offset = 0;
      for (const range of mesh.userData.modelPartRanges as ModelPartRange[]) {
        expect(range.start).toBe(offset);
        offset += range.count;
        counts.set(range.partId, (counts.get(range.partId) ?? 0) + range.count / 3);
      }
      expect(offset).toBe(mesh.geometry.getAttribute("position").count);
      expect(second.pickables.some(m => m.geometry === mesh.geometry || m.material === mesh.material)).toBe(false);
    }
    const ledger = modelParts(first.group);
    expect(ledger).toHaveLength(6);
    for (const p of ledger) expect(counts.get(p.id)).toBe(p.triangles);
    const spies = parts.map(p => vi.spyOn(p, "create")),
      solo = definition.assembleParts!([parts[4]]);
    try {
      for (const [i, spy] of spies.entries()) expect(spy).toHaveBeenCalledTimes(i === 4 ? 1 : 0);
    } finally {
      solo.dispose();
    }
    const owned = new Set(first.pickables.flatMap(m => [m.geometry, ...[m.material].flat()])),
      disposal = [...owned].map(r => vi.spyOn(r, "dispose"));
    first.dispose();
    for (const spy of disposal) expect(spy).toHaveBeenCalledTimes(1);
  } finally {
    second.dispose();
  }
});
