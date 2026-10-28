import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { buildingAppearancePreview } from "../../city-editor/generators/buildingAppearancePreview";
import { createBvPrototypeCache } from "./bvInstances";
import { REGIONAL_HOUSE_LOD_BUDGET as BUDGET, createTownRegionalHouseLod } from "./regionalHouseLod";

function lots() {
  const source = buildingAppearancePreview("northern-wooded")[0];
  return Array.from({ length: 100 }, (_, i) => {
    const x = (i % 10) * 10 - 45,
      y = Math.floor(i / 10) * 15 - 67.5;
    return { ...source, id: `house-${i}`, polygon: source.polygon.map(([a, b]) => [a + x, b + y] as [number, number]) };
  });
}
function camera(y: number) {
  const c = new THREE.PerspectiveCamera(65, 1, 0.1, 100000);
  c.position.set(0, y, 1);
  c.lookAt(0, 0, 0);
  c.updateProjectionMatrix();
  return c;
}
it("keeps far housing as exact massing, bounds near detail and settles without continuous work", () => {
  const cache = createBvPrototypeCache(),
    input = lots();
  const view = createTownRegionalHouseLod(input, cache, () => 3, "high");
  const far = camera(10000),
    near = camera(180);
  view.update(far, 1000);
  expect(view.stats.builds).toBe(0);
  expect(view.replaced.size).toBe(0);
  expect(view.massing.pickables.length).toBe(2);
  for (let i = 0; i < 50; i++) {
    const before = view.stats.builds;
    view.update(near, 8000);
    expect(view.stats.builds - before).toBeLessThanOrEqual(BUDGET.buildsPerFrame);
    expect(view.stats.buildings).toBeLessThanOrEqual(BUDGET.buildings);
    expect(view.stats.triangles).toBeLessThanOrEqual(BUDGET.triangles);
    expect(view.stats.cached).toBeLessThanOrEqual(BUDGET.cached);
    expect(view.stats.cachedTriangles).toBeLessThanOrEqual(BUDGET.cachedTriangles);
  }
  expect(view.stats.buildings).toBeGreaterThan(0);
  expect(view.stats.pending).toBe(false);
  const before = { ...view.stats };
  expect(view.update(near, 8000)).toBe(false);
  expect(view.stats).toEqual(before);
  const selected = [...view.replaced][0];
  for (const mesh of view.massing.pickables) {
    const indices = mesh.geometry.index!,
      ids = mesh.geometry.getAttribute("buildingIndex");
    for (let i = 0; i < mesh.geometry.drawRange.count; i++) expect(ids.getX(indices.getX(i))).not.toBe(selected);
  }
  const detail = view.pickables[0];
  expect(view.resolve({ object: detail, instanceId: 0 })).toBeDefined();
  const geometry = detail.geometry,
    free = vi.spyOn(geometry, "dispose");
  const clone = structuredClone(input);
  expect(view.refresh(clone, () => 3, "high")).toBe(true);
  view.update(near, 8000);
  expect(view.stats.builds).toBe(before.builds);
  expect(view.refresh(clone, () => 4, "high")).toBe(false);
  clone[0].massing!.storeys++;
  expect(view.refresh(clone, () => 3, "high")).toBe(false);
  view.update(far, 1000);
  expect(view.replaced.size).toBe(0);
  for (const mesh of view.massing.pickables)
    expect(mesh.geometry.index!.count).toBe(mesh.geometry.getAttribute("position").count);
  view.dispose();
  view.dispose();
  expect(free).toHaveBeenCalledOnce();
  expect(cache.size).toBe(0);
});
it("re-evaluates frontage after an equal-input refresh without keeping a stale door orientation", () => {
  const input = buildingAppearancePreview("atlantic").slice(0, 1),
    cache = createBvPrototypeCache();
  const resolver = (
    _lot: unknown,
    candidates: readonly { kind: "eave" | "gable"; flip: boolean; door: [number, number]; normal: [number, number] }[]
  ) => ({ ...candidates[0], source: "street" as const });
  const view = createTownRegionalHouseLod(input, cache, undefined, "high", resolver);
  const c = camera(30);
  view.update(c, 2000);
  const builds = view.stats.builds;
  expect(
    view.refresh(structuredClone(input), undefined, "high", (_lot, candidates) => ({
      ...candidates.at(-1)!,
      source: "street"
    }))
  ).toBe(true);
  view.update(c, 2000);
  expect(view.stats.builds).toBeGreaterThan(builds);
  view.dispose();
  expect(cache.size).toBe(0);
});

it("retains full distant housing beyond the automatic building and triangle budgets when urban simplification is off", () => {
  const cache = createBvPrototypeCache();
  const input = lots().slice(0, 90);
  const view = createTownRegionalHouseLod(input, cache, undefined, "high", undefined, false);
  const far = camera(10000);
  for (let i = 0; i < 50; i++) {
    const before = view.stats.builds;
    view.update(far, 720);
    expect(view.stats.builds - before).toBeLessThanOrEqual(BUDGET.buildsPerFrame);
  }
  expect(view.replaced.size).toBe(input.length);
  expect(view.stats.triangles).toBeGreaterThan(BUDGET.triangles);
  expect(view.stats.pending).toBe(false);
  const away = camera(10000);
  away.lookAt(0, 20000, 0);
  view.update(away, 720);
  expect(view.replaced.size).toBe(0);
  view.dispose();
  expect(cache.size).toBe(0);
});
