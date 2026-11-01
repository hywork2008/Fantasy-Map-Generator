import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { type ModelPartRange, modelParts } from "../modelParts";
import { model } from "./notreDame";

it.each([
  [model, "low", 15582, "010bc16205b0683c32d4f80b8c4c76e88b7a9686c047884f2503e60bb45f6d29"],
  [model.highDetail!, "high", 565667, "63de4c667eb6de3ec8f8b2d3bce91cc3f4a2881d77b68a5fdd36a546648b663f"]
] as const)(
  "Notre-Dame keeps $1 geometry, material settings and complete component ranges",
  (definition, quality, count, hash) => {
    const assembly = definition.create();
    try {
      if (quality === "low") expect(landmarkFingerprint(assembly.group)).toBe(hash);
      else {
        const other = definition.assembleParts!(definition.parts!().filter(part => part.role !== "ambulatory"));
        try {
          expect(landmarkFingerprint(other.group)).toBe(hash);
          expect(collectModelMetrics(other.group).triangles).toBe(count);
        } finally {
          other.dispose();
        }
      }
      const parts = modelParts(assembly.group);
      expect(parts).toHaveLength(11);
      expect(new Set(parts.map(part => part.id)).size).toBe(11);
      expect(parts.every(part => part.quality === quality && part.author === "Codex GPT-6.1 Sol")).toBe(true);
      const total = collectModelMetrics(assembly.group).triangles;
      if (quality === "low") expect(total).toBe(count);
      else {
        expect(total).toBeGreaterThan(count + 5000);
        expect(total).toBeLessThan(count + 20000);
      }
      expect(assembly.pickables.length).toBeLessThanOrEqual(10);
      const triangles = new Map<string, number>();
      for (const mesh of assembly.pickables) {
        let offset = 0;
        for (const range of mesh.userData.modelPartRanges as ModelPartRange[]) {
          expect(range.start).toBe(offset);
          offset += range.count;
          triangles.set(range.partId, (triangles.get(range.partId) ?? 0) + range.count / 3);
        }
        expect(offset).toBe(mesh.geometry.getAttribute("position").count);
      }
      for (const part of parts) expect(triangles.get(part.id)).toBe(part.triangles);
      expect(parts.reduce((sum, part) => sum + part.triangles, 0)).toBe(total);
    } finally {
      assembly.dispose();
    }
  }
);

it("Notre-Dame builds only a selected tower, preserving the open belfry and fitted coordinates", () => {
  const definition = model.highDetail!;
  const factories = definition.parts!(),
    selected = factories.find(part => part.role === "north-west-tower")!;
  const spies = factories.map(part => vi.spyOn(part, "create"));
  const tower = definition.assembleParts!([selected]);
  try {
    for (const [index, part] of factories.entries())
      expect(spies[index]).toHaveBeenCalledTimes(part === selected ? 1 : 0);
    tower.group.updateMatrixWorld(true);
    const ray = (z: number) =>
      new THREE.Raycaster(new THREE.Vector3(-80, 57, z), new THREE.Vector3(1, 0, 0)).intersectObjects(tower.pickables);
    expect(ray(-17.7)).toHaveLength(0);
    expect(ray(-14).length).toBeGreaterThan(0);
    expect(modelParts(tower.group).map(part => part.id)).toEqual(["notre-dame-paris:north-west-tower"]);
    const bounds = new THREE.Box3().setFromObject(tower.group);
    expect(bounds.max.z).toBeLessThan(0);
    expect(bounds.max.y).toBeCloseTo(69, 1);
  } finally {
    tower.dispose();
  }
});

it("Notre-Dame keeps tier IDs stable and owns independently disposable High ambulatory resources", () => {
  const low = model.parts!(),
    high = model.highDetail!.parts!();
  expect(low.map(part => part.id)).toEqual(high.map(part => part.id));
  const selected = high.find(part => part.role === "ambulatory")!;
  const first = model.highDetail!.assembleParts!([selected]),
    second = model.highDetail!.assembleParts!([selected]);
  try {
    expect(modelParts(first.group)[0].quality).toBe("high");
    expect(collectModelMetrics(first.group).triangles).toBeGreaterThan(5000);
    const resources = (assembly: typeof first) =>
      new Set(assembly.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
    const owned = resources(first),
      other = resources(second);
    for (const resource of owned) expect(other.has(resource)).toBe(false);
    const spies = [...owned].map(resource => vi.spyOn(resource, "dispose"));
    first.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(collectModelMetrics(second.group).triangles).toBe(collectModelMetrics(first.group).triangles);
  } finally {
    second.dispose();
  }
});
