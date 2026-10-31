import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { type ModelPartRange, modelParts } from "../modelParts";
import * as containers from "../props/medievalContainers";
import { models } from "./12-innsModels";

it.each(models)("$id keeps supported compositions, source accounting and court access", definition => {
  const large = definition.id === "courtyard-hostelry";
  for (const variant of definition.variants!) {
    for (const preset of definition.partPresets!) {
      const factories = definition.parts!(variant.id, preset.id);
      const roles = factories.map(part => part.role);
      expect(factories.every(part => part.quality === (part.role === "barrel" ? "low" : variant.level))).toBe(true);
      expect(roles).toEqual(
        preset.id === "lodging-only"
          ? ["courtyard", "lodging", "sign", ...(large ? ["gate"] : [])]
          : [
              "courtyard",
              "lodging",
              "stable",
              ...(large ? ["service-wing"] : []),
              ...(preset.id === "standard" ? ["yard-furniture", "barrel"] : []),
              "sign",
              ...(large ? ["gate"] : [])
            ]
      );
      const model = definition.assembleParts!(factories);
      try {
        const ledger = modelParts(model.group);
        expect(ledger.reduce((sum, part) => sum + part.triangles, 0)).toBe(collectModelMetrics(model.group).triangles);
        if (variant.level === "high") {
          // The shared Storage prop has its own four material colors.
          expect(model.pickables.length).toBeLessThanOrEqual(14);
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
          // Sample above the existing 0.30 m door threshold, which remains part of the lodging.
          for (const height of [0.4, 0.8, 1.4, 1.9]) {
            const entry = new THREE.Raycaster(new THREE.Vector3(0, height, 5.4), new THREE.Vector3(0, 0, -1), 0, 6.2);
            expect(entry.intersectObjects(model.pickables)).toHaveLength(0);
          }
          const wall = new THREE.Raycaster(new THREE.Vector3(1.1, 1.4, 0), new THREE.Vector3(0, 0, -1), 0, 1);
          expect(wall.intersectObjects(model.pickables).length).toBeGreaterThan(0);
          if (roles.includes("service-wing")) {
            const wingDoor = new THREE.Raycaster(new THREE.Vector3(4.2, 1.3, 2), new THREE.Vector3(1, 0, 0), 0, 0.6);
            expect(wingDoor.intersectObjects(model.pickables)).toHaveLength(0);
          }
        }
      } finally {
        model.dispose();
      }
    }
  }
});

it.each(models)("$id reuses the closed Storage barrel in both tiers with no gaps across its lid", definition => {
  const spy = vi.spyOn(containers, "createMedievalContainerModel");
  try {
    for (const variant of definition.variants!) {
      spy.mockClear();
      const factory = definition.parts!(variant.id).find(part => part.role === "barrel")!;
      expect(factory.quality).toBe("low");
      expect(factory.basedOn).toEqual(["container.barrel-closed@default#codex-gpt-6.1-sol"]);
      const solo = definition.assembleParts!([factory]);
      try {
        expect(spy).toHaveBeenCalledExactlyOnceWith("barrel", "closed");
        solo.group.updateMatrixWorld(true);
        const z = variant.level === "high" ? 0.6 : 0.5;
        const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
        for (let ix = -13; ix <= 13; ix++)
          for (let iz = -13; iz <= 13; iz++) {
            const x = ix * 0.02,
              dz = iz * 0.02;
            if (Math.hypot(x, dz) > 0.27) continue;
            ray.ray.origin.set(3 + x, 2, z + dz);
            const hits = ray.intersectObjects(solo.pickables);
            expect(hits.length, `Uncovered barrel lid at ${x}, ${dz}`).toBeGreaterThan(0);
            expect(hits[0].point.y).toBeCloseTo(0.99, 5);
          }
      } finally {
        solo.dispose();
      }
    }
  } finally {
    spy.mockRestore();
  }
});

it.each(models)("$id stable can be built alone with its open bays, solid back and supported roof", definition => {
  const high = definition.variants!.find(variant => variant.level === "high")!;
  const stable = definition.parts!(high.id).find(part => part.role === "stable")!;
  const solo = definition.assembleParts!([stable]);
  try {
    expect(modelParts(solo.group).map(part => part.role)).toEqual(["stable"]);
    solo.group.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(solo.group).min.y).toBeCloseTo(0);
    const bay = new THREE.Raycaster(new THREE.Vector3(-4, 1.3, 2.025), new THREE.Vector3(-1, 0, 0), 0, 0.7);
    expect(bay.intersectObjects(solo.pickables)).toHaveLength(0);
    const back = new THREE.Raycaster(new THREE.Vector3(-6.5, 1.3, 2.025), new THREE.Vector3(-1, 0, 0), 0, 1.2);
    expect(back.intersectObjects(solo.pickables).length).toBeGreaterThan(0);
    const roof = new THREE.Raycaster(new THREE.Vector3(-6, 6, 2.025), new THREE.Vector3(0, -1, 0));
    expect(roof.intersectObjects(solo.pickables)[0].face!.normal.y).toBeGreaterThan(0);
    expect(() => definition.parts!(high.id, "unsupported")).toThrow("Unknown inn preset");
  } finally {
    solo.dispose();
  }
});
