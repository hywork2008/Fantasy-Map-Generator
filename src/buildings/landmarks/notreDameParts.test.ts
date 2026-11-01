import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { type ModelPartRange, modelParts } from "../modelParts";
import { model } from "./notreDame";

it.each([
  [model, "low", 15582, "010bc16205b0683c32d4f80b8c4c76e88b7a9686c047884f2503e60bb45f6d29"],
  [model.highDetail!, "high", 565859, "56707a24263ee72ca871bf2c4f3abd29d530e5371e52063c0b0fea136a20b6b0"]
] as const)(
  "Notre-Dame keeps $1 geometry, material settings and complete component ranges",
  (definition, quality, count, hash) => {
    const assembly = definition.create();
    try {
      expect(landmarkFingerprint(assembly.group)).toBe(hash);
      const parts = modelParts(assembly.group);
      expect(parts).toHaveLength(11);
      expect(new Set(parts.map(part => part.id)).size).toBe(11);
      expect(
        parts.every(
          part => part.quality === (part.role === "ambulatory" ? "low" : quality) && part.author === "Codex GPT-6.1 Sol"
        )
      ).toBe(true);
      expect(collectModelMetrics(assembly.group).triangles).toBe(count);
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
      expect(parts.reduce((sum, part) => sum + part.triangles, 0)).toBe(count);
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

it("Notre-Dame keeps tier IDs stable and labels the undetailed ambulatory Low inside a High assembly", () => {
  const low = model.parts!(),
    high = model.highDetail!.parts!();
  expect(low.map(part => part.id)).toEqual(high.map(part => part.id));
  const selected = high.find(part => part.role === "ambulatory")!;
  const first = model.highDetail!.assembleParts!([selected]),
    second = model.highDetail!.assembleParts!([selected]);
  try {
    expect(modelParts(first.group)[0].quality).toBe("low");
    expect(collectModelMetrics(first.group).triangles).toBe(192);
    const resources = (assembly: typeof first) =>
      new Set(assembly.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
    const owned = resources(first),
      other = resources(second);
    for (const resource of owned) expect(other.has(resource)).toBe(false);
    const spies = [...owned].map(resource => vi.spyOn(resource, "dispose"));
    first.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(collectModelMetrics(second.group).triangles).toBe(192);
  } finally {
    second.dispose();
  }
});
