import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import * as trees from "../landscape/trees";
import { createModelAssembly, modelParts } from "../modelParts";
import { createMonastery, monasteryPartFactories, monasteryPreviewPlan } from "./friary";

it.each(["friary", "abbey", "orthodoxMonastery"] as const)(
  "builds every %s component independently in its fitted position without constructing other components",
  kind => {
    const plan = monasteryPreviewPlan(kind);
    const saved = JSON.stringify(plan);
    const whole = createMonastery(plan, 3, -1);
    const spy = vi.spyOn(trees, "createLandscapeTree");
    try {
      whole.group.updateMatrixWorld(true);
      const factories = monasteryPartFactories(plan, 3, -1);
      expect(spy).not.toHaveBeenCalled();
      expect(factories.map(part => part.id)).toEqual(modelParts(whole.group).map(part => part.id));
      const sourceGeometries = new Set(whole.pickables.map(mesh => mesh.geometry));
      for (const factory of factories) {
        spy.mockClear();
        const solo = createModelAssembly("solo", [factory]);
        try {
          expect(spy).toHaveBeenCalledTimes(factory.role === "vegetation" ? 1 : 0);
          expect(modelParts(solo.group)).toHaveLength(1);
          expect(collectModelMetrics(solo.group).triangles).toBe(
            modelParts(whole.group).find(part => part.id === factory.id)!.triangles
          );
          expect(solo.pickables.every(mesh => !sourceGeometries.has(mesh.geometry))).toBe(true);
          const sourceBounds = new THREE.Box3();
          for (const mesh of whole.pickables.filter(mesh => mesh.userData.modelPartId === factory.id))
            sourceBounds.union(new THREE.Box3().setFromObject(mesh));
          const bounds = new THREE.Box3().setFromObject(solo.group);
          expect(bounds.min.distanceTo(sourceBounds.min)).toBeLessThan(1e-6);
          expect(bounds.max.distanceTo(sourceBounds.max)).toBeLessThan(1e-6);
        } finally {
          solo.dispose();
        }
      }
      expect(JSON.stringify(plan)).toBe(saved);
    } finally {
      spy.mockRestore();
      whole.dispose();
    }
  }
);

it("selects a subset before generation and rejects unknown or repeated part ids", () => {
  const plan = monasteryPreviewPlan();
  const parts = monasteryPartFactories(plan);
  const ids = parts.filter(part => ["church", "cloister"].includes(part.role)).map(part => part.id);
  const spy = vi.spyOn(trees, "createLandscapeTree");
  const subset = createMonastery(plan, 0, 0, { partIds: ids, vegetationQuality: "ultra" });
  try {
    expect(spy).not.toHaveBeenCalled();
    expect(modelParts(subset.group).map(part => part.id)).toEqual(ids);
    expect(() => createMonastery(plan, 0, 0, { partIds: ["missing"] })).toThrow("Unknown monastery part");
    expect(() => createMonastery(plan, 0, 0, { partIds: [ids[0], ids[0]] })).toThrow("Duplicate");
  } finally {
    subset.dispose();
    spy.mockRestore();
  }
});

it("releases completed components if a later component factory fails", () => {
  const factory = monasteryPartFactories().find(part => part.role === "cloister")!;
  const component = factory.create();
  const dispose = vi.spyOn(component, "dispose");
  expect(() =>
    createModelAssembly("failed", [
      { ...factory, create: () => component },
      {
        ...factory,
        id: "failing",
        create: () => {
          throw new Error("factory failed");
        }
      }
    ])
  ).toThrow("factory failed");
  expect(dispose).toHaveBeenCalledTimes(1);
});
