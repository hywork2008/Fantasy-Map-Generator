import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { type ModelPartRange, modelParts } from "../modelParts";
import { models } from "./08-shop-housesModels";

it.each(models)("$id keeps component quality, supported presets and merged part ranges consistent", definition => {
  for (const variant of definition.variants!) {
    for (const preset of definition.partPresets!) {
      const factories = definition.parts!(variant.id, preset.id);
      expect(factories.every(part => part.quality === variant.level)).toBe(true);
      expect(factories.some(part => part.role === "shell")).toBe(true);
      expect(factories.some(part => part.role === "counter")).toBe(true);
      expect(factories.some(part => part.role === "stock")).toBe(preset.id !== "unstocked");
      expect(factories.some(part => part.role === "canopy")).toBe(preset.id !== "open-front");
      const model = definition.assembleParts!(factories);
      try {
        const ledger = modelParts(model.group);
        expect(ledger.map(part => part.id)).toEqual(factories.map(part => part.id));
        expect(ledger.reduce((sum, part) => sum + part.triangles, 0)).toBe(collectModelMetrics(model.group).triangles);
        if (variant.level === "high") {
          const triangles = new Map<string, number>();
          for (const mesh of model.pickables) {
            let offset = 0;
            for (const range of mesh.userData.modelPartRanges as ModelPartRange[]) {
              expect(range.start).toBe(offset);
              offset += range.count;
              triangles.set(range.partId, (triangles.get(range.partId) ?? 0) + range.count / 3);
            }
            expect(offset).toBe(mesh.geometry.getAttribute("position").count);
          }
          for (const part of ledger) expect(triangles.get(part.id)).toBe(part.triangles);
          expect(model.pickables.length).toBeLessThanOrEqual(9);
          const front = definition.id === "merchant-shop-house" ? 1 : 1.25;
          model.group.updateMatrixWorld(true);
          const ray = new THREE.Raycaster(
            new THREE.Vector3(-1.15, 1.5, front + 0.2),
            new THREE.Vector3(0, 0, -1),
            0,
            0.45
          );
          expect(ray.intersectObjects(model.pickables)).toHaveLength(0);
        }
      } finally {
        model.dispose();
      }
    }
  }
});

it("constructs a selected component without generating the shell or stock", () => {
  const definition = models[0];
  const high = definition.variants!.find(variant => variant.level === "high")!;
  const factories = definition.parts!(high.id);
  const spies = factories.map(part => vi.spyOn(part, "create"));
  const counter = factories.find(part => part.role === "counter")!;
  const solo = definition.assembleParts!([counter]);
  try {
    for (const [index, part] of factories.entries())
      expect(spies[index]).toHaveBeenCalledTimes(part === counter ? 1 : 0);
    expect(modelParts(solo.group).map(part => part.role)).toEqual(["counter"]);
    expect(() => definition.parts!(high.id, "unsupported")).toThrow("Unknown shop-house preset");
  } finally {
    solo.dispose();
  }
});
