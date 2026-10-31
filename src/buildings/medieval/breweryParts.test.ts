import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { type ModelPartRange, modelParts } from "../modelParts";
import * as containers from "../props/medievalContainers";
import { models } from "./15-breweriesModels";

it.each(models)("$id preserves supported brewing groups, openings and source accounting", definition => {
  const width = definition.id === "town-brewery" ? 8 : 5.5,
    cx = -2 + width / 2 + 3.35;
  for (const variant of definition.variants!)
    for (const preset of definition.partPresets!) {
      const factories = definition.parts!(variant.id, preset.id);
      expect(factories.every(part => part.quality === (part.role === "casks" ? "low" : variant.level))).toBe(true);
      const roles = factories.map(part => part.role);
      expect(roles.includes("casks")).toBe(preset.id === "standard");
      expect(roles.includes("hall")).toBe(preset.id !== "brewing-yard");
      for (const role of ["shelter", "heating-unit", "mash-tun", "malt-station"]) expect(roles).toContain(role);
      const model = definition.assembleParts!(factories);
      try {
        const ledger = modelParts(model.group);
        expect(ledger.reduce((sum, part) => sum + part.triangles, 0)).toBe(collectModelMetrics(model.group).triangles);
        if (variant.level === "high") {
          expect(model.pickables.length).toBeLessThanOrEqual(15);
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
          model.group.updateMatrixWorld(true);
          const mouth = new THREE.Raycaster(new THREE.Vector3(cx - 0.5, 0.5, 1.2), new THREE.Vector3(0, 0, -1), 0, 0.6);
          expect(mouth.intersectObjects(model.pickables)).toHaveLength(0);
          mouth.ray.origin.x += 0.6;
          expect(mouth.intersectObjects(model.pickables).length).toBeGreaterThan(0);
          const flue = new THREE.Raycaster(
            new THREE.Vector3(cx - 1.1, 5.3, -1.65),
            new THREE.Vector3(0, -1, 0),
            0,
            3.1
          );
          expect(flue.intersectObjects(model.pickables)).toHaveLength(0);
          const tun = new THREE.Raycaster(new THREE.Vector3(cx + 1.2, 2, 1.1), new THREE.Vector3(0, -1, 0));
          expect(tun.intersectObjects(model.pickables)[0].point.y).toBeCloseTo(0.946, 4);
        }
      } finally {
        model.dispose();
      }
    }
});

it.each(models)("$id heating unit retains furnace, copper and grounded chimney when built alone", definition => {
  const high = definition.variants!.find(variant => variant.level === "high")!;
  const part = definition.parts!(high.id).find(part => part.role === "heating-unit")!;
  const solo = definition.assembleParts!([part]);
  try {
    expect(modelParts(solo.group).map(part => part.role)).toEqual(["heating-unit"]);
    const width = definition.id === "town-brewery" ? 8 : 5.5,
      cx = -2 + width / 2 + 3.35;
    solo.group.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(solo.group).min.y).toBeCloseTo(0);
    const copper = new THREE.Raycaster(new THREE.Vector3(cx - 0.5, 2.1, 0), new THREE.Vector3(0, -1, 0));
    expect(copper.intersectObjects(solo.pickables)[0].point.y).toBeCloseTo(1.6, 4);
    expect(() => definition.parts!(high.id, "unsupported")).toThrow("Unknown brewery preset");
  } finally {
    solo.dispose();
  }
});

it.each(models)("$id storage casks use the shared closed prop and its declared Low quality", definition => {
  const spy = vi.spyOn(containers, "createMedievalContainerModel");
  try {
    for (const variant of definition.variants!) {
      spy.mockClear();
      const part = definition.parts!(variant.id).find(part => part.role === "casks")!;
      expect(part.quality).toBe("low");
      expect(part.basedOn).toEqual(["container.barrel-closed@default#codex-gpt-6.1-sol"]);
      const solo = definition.assembleParts!([part]);
      try {
        expect(spy).toHaveBeenCalledTimes(3);
        expect(spy.mock.calls.every(call => call[0] === "barrel" && call[1] === "closed")).toBe(true);
        solo.group.updateMatrixWorld(true);
        for (let i = 0; i < 3; i++) {
          const x = -4.4 + i * (variant.level === "high" ? 0.85 : 0.75),
            z = variant.level === "high" ? 2.3 : 2.2;
          for (const dx of [-0.22, 0, 0.22]) {
            const ray = new THREE.Raycaster(new THREE.Vector3(x + dx, 2, z), new THREE.Vector3(0, -1, 0));
            expect(ray.intersectObjects(solo.pickables)[0].point.y).toBeCloseTo(0.99, 5);
          }
        }
      } finally {
        solo.dispose();
      }
    }
  } finally {
    spy.mockRestore();
  }
});
