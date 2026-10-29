import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLandscapeTree } from "../../buildings/landscape/trees";
import { createDocument } from "../../city-editor/generators/document";
import { forestContains, forestRegions } from "../../city-editor/generators/forestGeometry";
import { withForestSettings } from "../../city-editor/generators/forestLandCover";
import * as flora from "../../city-editor/renderers/landscapeTreeSpecies";
import type { ForestPlan } from "../../city-editor/types/contracts/forest";
import type { Point } from "../../city-editor/types/document";
import { createTownForest, FOREST_3D_BUDGET } from "./forestMeshes";

afterEach(() => vi.restoreAllMocks());

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h]
];
const document = () =>
  withForestSettings(createDocument("forest-mesh", 800), { version: 1, mode: "surroundings", density: "standard" });
function plan(): ForestPlan {
  const regions = forestRegions([{ faceId: "f0", polygon: rect(-256, -256, 512, 512) }]);
  regions[0].holes = [rect(-32, -32, 64, 64).reverse()];
  regions[0].areaM2 -= 4096;
  return { regions, areaM2: regions[0].areaM2, forestFaceIds: ["f0"], protectedFarmCount: 0, protectedFarmAreaM2: 0 };
}
function camera(x = 90, y = 80, z = 250) {
  const c = new THREE.PerspectiveCamera(45, 1000 / 720, 0.5, 20000);
  c.position.set(x, y, z);
  c.lookAt(0, 0, 0);
  return c;
}
function visible(object: THREE.Object3D) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}
function instances(group: THREE.Group) {
  const points = new Map<string, THREE.Matrix4>();
  group.traverse(object => {
    if (!(object instanceof THREE.InstancedMesh) || !visible(object)) return;
    for (let i = 0; i < object.count; i++) {
      const m = new THREE.Matrix4();
      object.getMatrixAt(i, m);
      points.set(`${m.elements[12]},${m.elements[14]}`, m);
    }
  });
  return points;
}

describe("forest geometry and budgets", () => {
  it.each([
    ["hotDesert", "date_palm"],
    ["savanna", "umbrella_thorn"]
  ] as const)("preserves the %s tree's native tall or umbrella proportions in forest instances", (biome, species) => {
    const doc = document();
    doc.biome = { id: 1, key: biome, name: biome, color: "green" };
    const forest = createTownForest(doc, plan());
    try {
      forest.update(camera(0, 5000, 1), 720);
      let tree: THREE.InstancedMesh | undefined;
      forest.group.traverseVisible(object => {
        if (object instanceof THREE.InstancedMesh && object.count && object.userData.forestSpecies === species)
          tree ??= object;
      });
      expect(tree).toBeDefined();
      const matrix = new THREE.Matrix4();
      tree!.getMatrixAt(0, matrix);
      const p = tree!.geometry.getAttribute("position"),
        v = new THREE.Vector3();
      let min = Infinity,
        max = -Infinity,
        radius = 0;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(matrix);
        min = Math.min(min, v.y);
        max = Math.max(max, v.y);
        radius = Math.max(radius, Math.hypot(v.x - matrix.elements[12], v.z - matrix.elements[14]));
      }
      const aspect = (max - min) / (2 * radius);
      if (species === "umbrella_thorn") expect(aspect).toBeLessThan(0.8);
      else expect(aspect).toBeGreaterThan(0.8);
    } finally {
      forest.dispose();
    }
  });

  it("cuts the same openings through floor and canopy and samples the terrain instead of a horizontal plate", () => {
    const p = plan(),
      heightAt = ([x, y]: Point) => 20 + x * 0.05 + y * 0.02;
    const forest = createTownForest(document(), p, { heightAt, relief: true });
    let area = 0,
      minHeight = Infinity,
      maxHeight = -Infinity;
    for (const object of forest.group.children) {
      if (!(object instanceof THREE.Mesh) || !object.name.startsWith("forest-canopy-")) continue;
      const a = object.geometry.getAttribute("position");
      for (let i = 0; i < a.count; i += 3) {
        const points: Point[] = [0, 1, 2].map(j => [a.getX(i + j), -a.getZ(i + j)]);
        const cross =
          (points[1][0] - points[0][0]) * (points[2][1] - points[0][1]) -
          (points[1][1] - points[0][1]) * (points[2][0] - points[0][0]);
        if (i < object.geometry.userData.forestBaseVertices) area += Math.abs(cross) / 2;
        if (Math.abs(cross) > 1e-6) {
          const middle: Point = [points.reduce((n, q) => n + q[0], 0) / 3, points.reduce((n, q) => n + q[1], 0) / 3];
          expect(forestContains(p.regions[0], middle)).toBe(true);
        }
      }
    }
    for (const object of forest.group.children) {
      if (!(object instanceof THREE.Mesh) || !object.name.startsWith("forest-floor-")) continue;
      const a = object.geometry.getAttribute("position");
      for (let i = 0; i < a.count; i++) {
        expect(a.getY(i)).toBeCloseTo(heightAt([a.getX(i), -a.getZ(i)]) + 0.035, 4);
        minHeight = Math.min(minHeight, a.getY(i));
        maxHeight = Math.max(maxHeight, a.getY(i));
      }
    }
    expect(area).toBeCloseTo(p.areaM2 * 2, 2);
    expect(maxHeight - minHeight).toBeGreaterThan(20);
    forest.dispose();
  });

  it("grounds every root and keeps complete crowns out of clearings while switching stable LODs", () => {
    const p = plan(),
      heightAt = ([x, y]: Point) => x * 0.02 + y * 0.01;
    const forest = createTownForest(document(), p, { heightAt, relief: true }, "high");
    const c = camera();
    forest.update(c, 720);
    const first = instances(forest.group);
    expect(first.size).toBeGreaterThan(0);
    for (const m of first.values()) {
      const [x, h, z] = [m.elements[12], m.elements[13], m.elements[14]],
        radius = Math.hypot(m.elements[0], m.elements[2]);
      expect(h).toBeCloseTo(heightAt([x, -z]), 4);
      for (const q of [
        [x - radius, -z],
        [x + radius, -z],
        [x, -z - radius],
        [x, -z + radius]
      ] as Point[])
        expect(forestContains(p.regions[0], q)).toBe(true);
    }
    forest.setQuality("light");
    forest.update(c, 720);
    const second = instances(forest.group);
    let common = 0;
    for (const [key, m] of second)
      if (first.has(key)) {
        expect(m.elements).toEqual(first.get(key)!.elements);
        common++;
      }
    expect(common).toBeGreaterThan(0);
    expect(forest.stats.shadowTriangles).toBe(0);
    forest.dispose();
  });

  it("enforces instance, triangle, draw and shadow limits and does no work for an unchanged camera", () => {
    const doc = document();
    doc.biome = { id: 1, key: "wetland", name: "Wetland", color: "green" };
    vi.spyOn(flora, "landscapeTreeSpecies").mockReturnValue("mediterranean_cypress");
    const forest = createTownForest(doc, plan());
    const c = camera();
    for (const quality of ["light", "standard", "high"] as const) {
      forest.setQuality(quality);
      forest.update(c, 720);
      const s = forest.stats,
        b = FOREST_3D_BUDGET[quality];
      expect(s.trees).toBeLessThanOrEqual(b.trees);
      expect(s.triangles).toBeLessThanOrEqual(b.triangles);
      expect(s.calls).toBeLessThanOrEqual(b.calls);
      expect(s.shadowTriangles).toBeLessThanOrEqual(b.shadowTriangles);
      const before = { ...s };
      expect(forest.update(c, 720)).toBe(false);
      expect(forest.stats).toEqual(before);
      let shadowTriangles = 0;
      forest.group.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !visible(object) || !object.castShadow) return;
        expect(object).toBeInstanceOf(THREE.InstancedMesh);
        shadowTriangles +=
          ((object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3) *
          (object as THREE.InstancedMesh).count;
      });
      expect(shadowTriangles).toBe(s.shadowTriangles);
    }
    forest.dispose();
  });

  it("uses adopted BV tiers and restores placements after distant aggregation", () => {
    const doc = document(),
      p = plan(),
      c = camera();
    doc.biome = { id: 1, key: "wetland", name: "Wetland", color: "green" };
    vi.spyOn(flora, "landscapeTreeSpecies").mockReturnValue("mediterranean_cypress");
    const forest = createTownForest(doc, p, undefined, "standard");
    forest.update(c, 720);
    const original = instances(forest.group);
    expect(forest.stats.detailedTrees).toBeGreaterThan(0);
    forest.setQuality("high");
    forest.update(c, 720);
    expect(forest.stats.detailedTrees).toBeGreaterThan(0);
    expect(forest.stats.detailedSpecies).toContain("mediterranean_cypress");
    const bv: THREE.InstancedMesh[] = [];
    forest.group.traverse(o => {
      if (o instanceof THREE.InstancedMesh && o.name.startsWith("forest-bv-") && visible(o)) bv.push(o);
    });
    expect(bv.length).toBeGreaterThan(0);
    let detailedTriangles = 0;
    for (const mesh of bv) {
      const source = createLandscapeTree("mediterranean_cypress", mesh.userData.treeQuality);
      const modelTriangles = source.pickables.reduce(
        (sum, m) => sum + m.geometry.getAttribute("position").count / 3,
        0
      );
      source.dispose();
      expect(mesh.geometry.getAttribute("position").count / 3).toBe(modelTriangles);
      detailedTriangles += modelTriangles * mesh.count;
      for (let i = 0; i < mesh.count; i++) {
        const m = new THREE.Matrix4();
        mesh.getMatrixAt(i, m);
        const position = `${m.elements[12]},${m.elements[14]}`;
        if (original.has(position)) expect(m.elements).toEqual(original.get(position)!.elements);
      }
    }
    expect(forest.stats.detailedTriangles).toBe(detailedTriangles);
    forest.setQuality("standard");
    forest.update(camera(0, 50000, 1), 720);
    expect(forest.stats.detailedTrees).toBe(0);
    for (const mesh of bv) expect(mesh.visible).toBe(false);
    forest.update(c, 720);
    const restored = instances(forest.group);
    for (const [id, m] of original) if (restored.has(id)) expect(restored.get(id)!.elements).toEqual(m.elements);
    forest.dispose();
  });

  it.each([
    ["hotDesert", "date_palm"],
    ["savanna", "umbrella_thorn"],
    ["coldDesert", "saxaul"],
    ["tropicalRainforest", "kapok"],
    ["temperateRainforest", "western_red_cedar"],
    ["wetland", "black_alder"],
    ["mediterraneanWoodlandScrub", "olive"],
    ["montaneForest", "silver_fir"],
    ["mangrove", "red_mangrove"],
    ["xericShrubland", "tamarisk"],
    ["alpineTundra", "rowan"],
    ["volcanicBarrens", "canary_pine"]
  ])("uses the new %s BV flora (%s) and frees shared resources exactly once", (biome, species) => {
    const doc = document();
    doc.biome = { id: 1, key: biome, name: biome, color: "#357544" };
    const forest = createTownForest(doc, plan(), undefined, "high");
    forest.update(camera(), 720);
    expect(forest.stats.detailedSpecies).toContain(species);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    forest.group.traverse(o => {
      if (o instanceof THREE.Mesh && o.name.startsWith("forest-bv-")) {
        resources.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) resources.add(m);
      }
    });
    expect(resources.size).toBeGreaterThan(0);
    const spies = [...resources].map(r => vi.spyOn(r, "dispose"));
    forest.dispose();
    forest.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });

  it("aggregates distant chunks rather than deleting forest when the draw budget is exhausted", () => {
    const regions = forestRegions(
      Array.from({ length: 90 }, (_, i) => ({
        faceId: `f${i}`,
        polygon: rect((i % 10) * 300, Math.floor(i / 10) * 300, 20, 20)
      }))
    );
    const p: ForestPlan = { regions, areaM2: 36000, forestFaceIds: [], protectedFarmAreaM2: 0, protectedFarmCount: 0 };
    const doc = document();
    doc.biome = { id: 1, key: "wetland", name: "Wetland", color: "green" };
    vi.spyOn(flora, "landscapeTreeSpecies").mockReturnValue("mediterranean_cypress");
    const forest = createTownForest(doc, p, undefined, "light");
    const c = camera(1400, 8000, 1400);
    c.lookAt(1400, 0, -1200);
    forest.update(c, 720);
    expect(forest.stats.globalFallback).toBe(true);
    expect(forest.stats.calls).toBe(1);
    expect(forest.stats.areaM2).toBe(p.areaM2);
    expect(forest.stats.triangles).toBeGreaterThan(0);
    expect(forest.stats.triangles).toBeLessThan(100000);
    forest.dispose();
  });

  it("releases shared geometry and material exactly once, including instantiated LOD layers", () => {
    const forest = createTownForest(document(), plan());
    forest.update(camera(), 720);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    forest.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      resources.add(object.geometry);
      for (const m of Array.isArray(object.material) ? object.material : [object.material]) resources.add(m);
    });
    const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    forest.dispose();
    forest.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(forest.group.children).toHaveLength(0);
    expect(forest.update(camera(), 720)).toBe(false);
  });
});

it("uses BV trees beyond distance and count caps when outskirts simplification is off", () => {
  const regions = forestRegions([{ faceId: "f0", polygon: rect(-32, -32, 64, 64) }]);
  const p: ForestPlan = {
    regions,
    areaM2: regions[0].areaM2,
    forestFaceIds: ["f0"],
    protectedFarmCount: 0,
    protectedFarmAreaM2: 0
  };
  const automatic = createTownForest(document(), p, undefined, "high");
  const full = createTownForest(document(), p, undefined, "light", false);
  const far = camera(0, 5000, 10);
  automatic.update(far, 720);
  full.update(far, 720);
  expect(automatic.stats.detailedTiers.low).toBe(automatic.stats.trees);
  expect(full.stats.quality).toBe("high");
  expect(full.stats.detailedTrees).toBeGreaterThan(16);
  expect(full.stats.detailedTrees).toBe(full.stats.trees);
  expect(full.stats.triangles).toBeGreaterThan(FOREST_3D_BUDGET.high.triangles);
  expect(full.stats.areaM2).toBe(automatic.stats.areaM2);
  full.setQuality("light");
  full.update(far, 720);
  expect(full.stats.quality).toBe("high");
  automatic.dispose();
  full.dispose();
});

it("draws only adopted lime distance tiers, even beyond the former replacement cap and geometry budget", () => {
  const doc = document();
  doc.biome = { id: 13, key: "centralEuropeanGreatForest", name: "Great forest", color: "green", tags: ["forest"] };
  const forest = createTownForest(doc, plan(), undefined, "standard");
  const c = camera();
  forest.update(c, 720);
  expect(forest.stats.detailedTrees).toBeGreaterThan(16);
  expect(
    forest.stats.detailedTiers.medium + forest.stats.detailedTiers.high + forest.stats.detailedTiers.ultra
  ).toBeGreaterThan(0);
  expect(forest.stats.trees).toBe(forest.stats.detailedTrees);
  expect(forest.stats.detailedTrees).toBeGreaterThan(256);
  const tiers = { ...forest.stats.detailedTiers };
  for (const quality of ["light", "high", "standard"] as const) {
    forest.setQuality(quality);
    forest.update(c, 720);
    expect(forest.stats.detailedTiers).toEqual(tiers);
    expect(forest.stats.trees).toBe(forest.stats.detailedTrees);
    forest.group.traverse(o => {
      if (o instanceof THREE.Mesh && visible(o) && !o.name.startsWith("forest-floor-"))
        expect(o.name.startsWith("forest-bv-")).toBe(true);
    });
  }
  expect(forest.stats.shadowTriangles).toBeLessThanOrEqual(FOREST_3D_BUDGET.standard.shadowTriangles);
  c.lookAt(90, 80, 1000);
  forest.update(c, 720);
  expect(forest.stats.detailedTrees).toBe(0);
  forest.dispose();
});

it.each(["marine", "tundra", "glacier", "lavaField"])(
  "rejects a stale %s forest plan even with simplification disabled",
  key => {
    const doc = document();
    doc.biome = { id: 1, key, name: key, color: "grey" };
    const input = plan();
    const forest = createTownForest(doc, input, undefined, "high", false);
    try {
      forest.update(camera(), 720);
      expect(forest.stats.areaM2).toBe(0);
      expect(forest.stats.trees).toBe(0);
      expect(forest.stats.triangles).toBe(0);
      expect(input.areaM2).toBeGreaterThan(0);
    } finally {
      forest.dispose();
    }
  }
);
