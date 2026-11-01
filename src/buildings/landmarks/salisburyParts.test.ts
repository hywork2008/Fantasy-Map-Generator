import { createHash } from "node:crypto";
import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { type ModelPartRange, modelParts } from "../modelParts";
import { SALISBURY_CHAPTER_HOUSE } from "./gothic/salisburyChapterHouse";
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
  [model.highDetail!, "high", 295384, "bb09ca3aae5885385d5009debc3c9c015b82770fdf184fd067b758539755d2c5"]
] as const)("retains unchanged $1 architecture and complete merged part ranges", (definition, quality, count, hash) => {
  const assembly = definition.create();
  try {
    if (quality === "low") expect(fingerprint(assembly.group)).toBe(hash);
    else {
      const unchanged = definition.assembleParts!(definition.parts!().filter(part => part.role !== "chapter-house"));
      try {
        expect(fingerprint(unchanged.group)).toBe(hash);
        expect(collectModelMetrics(unchanged.group).triangles).toBe(count);
      } finally {
        unchanged.dispose();
      }
    }
    const parts = modelParts(assembly.group);
    expect(parts).toHaveLength(12);
    expect(new Set(parts.map(part => part.id)).size).toBe(12);
    expect(parts.every(part => part.quality === quality && part.author === "Codex GPT-6.1 Sol")).toBe(true);
    const total = collectModelMetrics(assembly.group).triangles;
    if (quality === "low") expect(total).toBe(count);
    else {
      expect(total).toBeGreaterThan(count + 5000);
      expect(total).toBeLessThan(count + 20000);
    }
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
    expect(assembly.pickables.length).toBeLessThanOrEqual(8);
  } finally {
    assembly.dispose();
  }
});

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
  const chapter = high.find(part => part.role === "chapter-house")!;
  const first = model.highDetail!.assembleParts!([chapter]);
  const second = model.highDetail!.assembleParts!([chapter]);
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

it("opens the High chapter-house walls, recesses glazing and keeps the entrance connected to the cloister", () => {
  const definition = model.highDetail!;
  const factories = definition.parts!();
  const chapter = definition.assembleParts!(factories.filter(part => part.role === "chapter-house"));
  const connected = definition.assembleParts!(
    factories.filter(part => ["chapter-house", "cloister"].includes(part.role))
  );
  const { x, z, radius, entranceFace } = SALISBURY_CHAPTER_HOUSE;
  const apothem = radius * Math.cos(Math.PI / 8);
  const point = (angle: number, u: number, y: number, d: number) =>
    new THREE.Vector3(x + Math.cos(angle) * u + Math.sin(angle) * d, y, z - Math.sin(angle) * u + Math.cos(angle) * d);
  const ray = (angle: number, u: number, y: number, start: number, length: number, outward = false) =>
    new THREE.Raycaster(
      point(angle, u, y, start),
      new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(outward ? 1 : -1),
      0,
      length
    );
  try {
    chapter.group.updateMatrixWorld(true);
    connected.group.updateMatrixWorld(true);
    const angle = Math.PI / 8;
    expect(ray(angle, 0.32, 4.2, apothem + 0.1, 0.3).intersectObjects(chapter.pickables)).toHaveLength(0);
    const windowHits = ray(angle, 0.32, 4.2, apothem + 0.1, 0.5).intersectObjects(chapter.pickables);
    expect(windowHits.length).toBeGreaterThan(0);
    expect(
      (windowHits[0].object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>).material.color.getHex()
    ).toBe(0x6c959a);
    expect(ray(angle, 2.75, 4.2, apothem + 0.1, 0.3).intersectObjects(chapter.pickables).length).toBeGreaterThan(0);
    const entrance = ((entranceFace + 0.5) * Math.PI) / 4;
    for (const u of [-0.5, 0, 0.5]) {
      expect(ray(entrance, u, 1.4, 13.3, 6.5).intersectObjects(chapter.pickables)).toHaveLength(0);
      expect(ray(entrance, u, 1.4, apothem - 0.5, 7, true).intersectObjects(connected.pickables)).toHaveLength(0);
    }
    for (const mesh of chapter.pickables)
      for (const name of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    const bounds = new THREE.Box3().setFromObject(chapter.group);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeLessThan(18.2);
    expect(collectModelMetrics(chapter.group).triangles).toBeGreaterThan(5000);
    expect(collectModelMetrics(chapter.group).triangles).toBeLessThan(20000);
    expect(chapter.pickables.length).toBeLessThanOrEqual(5);
  } finally {
    chapter.dispose();
    connected.dispose();
  }
});
