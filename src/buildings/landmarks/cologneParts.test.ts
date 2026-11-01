import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { type ModelPartRange, modelParts } from "../modelParts";
import { model } from "./cologne";
import { heightAt } from "./landmarkTestSupport";

it.each([
  [model, "low", 13976, "58139dcc3882edec58c837b9e5634ad29ebd26df558ddbea29135c72230fa0b8"],
  [model.highDetail!, "high", 443208, "ce26ac994c2301e7f1e989ae04de38f28f84060db19ca7875d53d712d4a8e0c5"]
] as const)(
  "cologne retains its original $1 geometry, materials and complete component ranges",
  (definition, quality, count, hash) => {
    const assembly = definition.create();
    try {
      expect(landmarkFingerprint(assembly.group)).toBe(hash);
      const parts = modelParts(assembly.group);
      expect(parts).toHaveLength(12);
      expect(new Set(parts.map(part => part.id)).size).toBe(12);
      expect(parts.every(part => part.quality === quality && part.author === "Codex GPT-6.1 Sol")).toBe(true);
      expect(collectModelMetrics(assembly.group).triangles).toBe(count);
      expect(assembly.pickables.length).toBeLessThanOrEqual(7);
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

it("cologne generates only the chosen tower at its original fitted position", () => {
  const definition = model.highDetail!;
  const factories = definition.parts!();
  const selected = factories.find(part => part.role === "north-west-tower")!;
  const spies = factories.map(part => vi.spyOn(part, "create"));
  const tower = definition.assembleParts!([selected]);
  try {
    for (const [index, part] of factories.entries())
      expect(spies[index]).toHaveBeenCalledTimes(part === selected ? 1 : 0);
    expect(modelParts(tower.group).map(part => part.id)).toEqual(["cologne:north-west-tower"]);
    tower.group.updateMatrixWorld(true);
    expect(heightAt(tower, -57, -18)).toBeCloseTo(157.22, 1);
    expect(heightAt(tower, -57, 18)).toBe(0);
    expect(heightAt(tower, 7, 0)).toBe(0);
    const bounds = new THREE.Box3().setFromObject(tower.group);
    expect(bounds.max.x).toBeLessThan(-40);
    expect(bounds.max.z).toBeLessThan(0);
  } finally {
    tower.dispose();
  }
});

it("cologne keeps stable tier IDs and owns independently disposable component resources", () => {
  const low = model.parts!(),
    high = model.highDetail!.parts!();
  expect(low.map(part => part.id)).toEqual(high.map(part => part.id));
  const selected = high.find(part => part.role === "radiating-chapels")!;
  const first = model.highDetail!.assembleParts!([selected]),
    second = model.highDetail!.assembleParts!([selected]);
  try {
    const resources = (assembly: typeof first) =>
      new Set(assembly.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
    const owned = resources(first),
      other = resources(second);
    for (const resource of owned) expect(other.has(resource)).toBe(false);
    const spies = [...owned].map(resource => vi.spyOn(resource, "dispose"));
    first.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(collectModelMetrics(second.group).triangles).toBeGreaterThan(0);
  } finally {
    second.dispose();
  }
});
