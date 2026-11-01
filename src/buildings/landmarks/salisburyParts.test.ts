import { createHash } from "node:crypto";
import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { type ModelPartRange, modelParts } from "../modelParts";
import { heightAt } from "./landmarkTestSupport";
import { model } from "./salisbury";

// Fixed pre-split world-space geometry, normals, winding and material settings.
function fingerprint(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const triangles: string[] = [];
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    const position = g.getAttribute("position"),
      normal = g.getAttribute("normal");
    const { uuid, ...material } = (mesh.material as THREE.Material).toJSON();
    const surface = JSON.stringify(material);
    for (let start = 0; start < position.count; start += 3) {
      const values: number[] = [];
      for (let i = start; i < start + 3; i++) {
        for (const attribute of [position, normal])
          values.push(...[attribute.getX(i), attribute.getY(i), attribute.getZ(i)].map(v => Math.round(v * 1e5)));
      }
      triangles.push(`${surface}:${values.join(",")}`);
    }
    g.dispose();
  });
  return createHash("sha256").update(triangles.sort().join("\n")).digest("hex");
}

it.each([
  [model, "low", 11754, "57830caca7f54e783d539e880c5e7753acdb75a1f9357ed668e4789d2e167edd"],
  [model.highDetail!, "high", 295432, "7c1cc576afd8a4585a1ba66efb900d5a5fb336b96e64e17bbc83b270581dafad"]
] as const)(
  "retains the original $1 landmark geometry and complete merged part ranges",
  (definition, quality, count, hash) => {
    const assembly = definition.create();
    try {
      expect(fingerprint(assembly.group)).toBe(hash);
      const parts = modelParts(assembly.group);
      expect(parts).toHaveLength(12);
      expect(new Set(parts.map(part => part.id)).size).toBe(12);
      expect(
        parts.every(
          part =>
            part.quality === (part.role === "chapter-house" ? "low" : quality) && part.author === "Codex GPT-6.1 Sol"
        )
      ).toBe(true);
      expect(collectModelMetrics(assembly.group).triangles).toBe(count);
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
      expect(assembly.pickables.length).toBeLessThanOrEqual(8);
    } finally {
      assembly.dispose();
    }
  }
);

it("constructs only the selected cloister, retaining the open garth and its fitted position", () => {
  const definition = model.highDetail!;
  const factories = definition.parts!();
  const spies = factories.map(part => vi.spyOn(part, "create"));
  const cloister = factories.find(part => part.role === "cloister")!;
  const assembly = definition.assembleParts!([cloister]);
  try {
    for (const [index, part] of factories.entries())
      expect(spies[index]).toHaveBeenCalledTimes(part === cloister ? 1 : 0);
    expect(modelParts(assembly.group).map(part => part.id)).toEqual(["salisbury:cloister"]);
    assembly.group.updateMatrixWorld(true);
    expect(heightAt(assembly, -37, 45)).toBe(0);
    expect(heightAt(assembly, -37, 27)).toBeGreaterThan(6);
    expect(heightAt(assembly, -5, 0)).toBe(0);
    expect(heightAt(assembly, -7, 58)).toBe(0);
    const bounds = new THREE.Box3().setFromObject(assembly.group);
    expect(bounds.min.z).toBeGreaterThan(20);
  } finally {
    assembly.dispose();
  }
});

it("keeps Low and High component IDs stable and creates independently owned geometry and materials", () => {
  const low = model.parts!(),
    high = model.highDetail!.parts!();
  expect(low.map(part => part.id)).toEqual(high.map(part => part.id));
  const first = model.highDetail!.assembleParts!([high[0]]);
  const second = model.highDetail!.assembleParts!([high[0]]);
  const resources = (assembly: typeof first) =>
    new Set(assembly.pickables.flatMap(mesh => [mesh.geometry, ...[mesh.material].flat()]));
  const owned = resources(first),
    other = resources(second);
  for (const resource of owned) expect(other.has(resource)).toBe(false);
  const spies = [...owned].map(resource => vi.spyOn(resource, "dispose"));
  first.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  expect(collectModelMetrics(second.group).triangles).toBeGreaterThan(0);
  second.dispose();
});
