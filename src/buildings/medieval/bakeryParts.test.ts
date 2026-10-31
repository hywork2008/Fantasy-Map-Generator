import * as THREE from "three";
import { expect, it } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { type ModelPartRange, modelParts } from "../modelParts";
import { models } from "./10-bakeriesModels";

it.each(models)("$id preserves oven access and support groups in all quality and composition choices", definition => {
  for (const variant of definition.variants!) {
    for (const preset of definition.partPresets!) {
      const factories = definition.parts!(variant.id, preset.id);
      const roles = factories.map(part => part.role);
      expect(factories.every(part => part.quality === variant.level)).toBe(true);
      expect(roles).toContain("oven");
      expect(roles).toContain("fuel");
      if (preset.id === "oven-only") expect(roles).toEqual(["oven", "fuel"]);
      if (preset.id === "core-site")
        expect(roles).toEqual([definition.id === "communal-bread-oven" ? "shelter" : "shell", "oven", "fuel"]);
      if (roles.includes("bread")) expect(roles).toContain("cooling-bench");
      const model = definition.assembleParts!(factories);
      try {
        const ledger = modelParts(model.group);
        expect(ledger.map(part => part.id)).toEqual(factories.map(part => part.id));
        expect(ledger.reduce((sum, part) => sum + part.triangles, 0)).toBe(collectModelMetrics(model.group).triangles);
        if (variant.level === "high") {
          expect(model.pickables.length).toBeLessThanOrEqual(10);
          const counts = new Map<string, number>();
          for (const mesh of model.pickables) {
            let offset = 0;
            for (const range of mesh.userData.modelPartRanges as ModelPartRange[]) {
              expect(range.start).toBe(offset);
              offset += range.count;
              counts.set(range.partId, (counts.get(range.partId) ?? 0) + range.count / 3);
            }
            expect(offset).toBe(mesh.geometry.getAttribute("position").count);
          }
          for (const part of ledger) expect(counts.get(part.id)).toBe(part.triangles);
          const communal = definition.id === "communal-bread-oven",
            town = definition.id === "town-bakery";
          const x = communal ? 0 : town ? 4 : 3,
            z = communal || town ? -0.5 : 0;
          model.group.updateMatrixWorld(true);
          const ray = new THREE.Raycaster(new THREE.Vector3(x, 1.15, z + 1.3), new THREE.Vector3(0, 0, -1), 0, 0.8);
          expect(ray.intersectObjects(model.pickables)).toHaveLength(0);
          ray.far = 2.5;
          expect(ray.intersectObjects(model.pickables).length).toBeGreaterThan(0);
          const top = communal ? 4.55 : 2.9;
          ray.set(new THREE.Vector3(x + 0.7, top + 0.2, z - 0.4), new THREE.Vector3(0, -1, 0));
          ray.far = 0.4;
          expect(ray.intersectObjects(model.pickables)).toHaveLength(0);
          ray.ray.origin.x += 0.33;
          expect(ray.intersectObjects(model.pickables).length).toBeGreaterThan(0);
        }
      } finally {
        model.dispose();
      }
    }
  }
});

it.each(models)("$id High peel component includes its rests and can be built alone", definition => {
  const high = definition.variants!.find(variant => variant.level === "high")!;
  const factory = definition.parts!(high.id).find(part => part.role === "tools")!;
  const solo = definition.assembleParts!([factory]);
  try {
    expect(modelParts(solo.group).map(part => part.role)).toEqual(["tools"]);
    solo.group.updateMatrixWorld(true);
    const communal = definition.id === "communal-bread-oven";
    const ray = new THREE.Raycaster(
      new THREE.Vector3(communal ? -1.95 : -3.7, 1.2, communal ? 1.25 : 3.53),
      new THREE.Vector3(0, -1, 0)
    );
    expect(ray.intersectObjects(solo.pickables)[0].point.y).toBeCloseTo(communal ? 0.81 : 1.02);
    expect(() => definition.parts!(high.id, "unsupported")).toThrow("Unknown bakery preset");
  } finally {
    solo.dispose();
  }
});
