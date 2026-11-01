import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { adoptedVariant } from "../../city3d/adoption";
import { type ModelPartRange, modelParts } from "../modelParts";
import { CEMETERY_VARIANTS } from "../siteVariants";
import { models } from "./44-cemetery-facilitiesModels";
import { PREACHING_CROSS_HEAD_BASE, preachingCrossPartFactories } from "./preachingCrossParts";

const definition = models.find(m => m.id === "preaching-cross-calvary")!;
it("registers explicit cemetery Low and High without changing the legacy CE default", () => {
  expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
  expect(adoptedVariant("cemetery.preaching_cross_calvary", "high").id).toBe(definition.variants![1].id);
  for (const variant of CEMETERY_VARIANTS.filter(
    v => v.family === "cemetery.preaching_cross_calvary" && v.level !== "high"
  )) {
    const model = variant.create();
    try {
      expect(landmarkFingerprint(model.group)).toBe("692be8898970dcbe7559df548dba35eca203e77036629af6b5c3c42eccfe0325");
    } finally {
      model.dispose();
    }
  }
});

it("seats all three steps and embeds the shaft and head in their continuous stone supports", () => {
  const parts = preachingCrossPartFactories(),
    base = parts[0].create(),
    shaft = parts[1].create(),
    head = parts[2].create();
  try {
    const steps = base.pickables
      .filter(m => m.name === "dressed-platform-step")
      .map(m => new THREE.Box3().setFromObject(m));
    expect(steps).toHaveLength(3);
    expect(steps[0].min.y).toBeCloseTo(0);
    expect(steps[1].min.y).toBeCloseTo(steps[0].max.y);
    expect(steps[2].min.y).toBeCloseTo(steps[1].max.y);
    const socket = new THREE.Box3().setFromObject(base.pickables.find(m => m.name === "cross-socket-block")!);
    expect(socket.min.y).toBeCloseTo(steps[2].max.y);
    expect(
      socket.intersectsBox(
        new THREE.Box3().setFromObject(shaft.pickables.find(m => m.name === "tapered-octagonal-shaft")!)
      )
    ).toBe(true);
    const capital = new THREE.Box3().setFromObject(shaft.pickables.find(m => m.name === "cross-capital")!);
    expect(capital.intersectsBox(new THREE.Box3().setFromObject(head.group))).toBe(true);
  } finally {
    base.dispose();
    shaft.dispose();
    head.dispose();
  }
});

it("carves both faces to a real recessed floor while retaining a continuous structural core", () => {
  const model = preachingCrossPartFactories()[2].create();
  try {
    model.group.updateMatrixWorld(true);
    const panels = model.pickables.filter(m => m.name === "carved-cross-face");
    expect(panels).toHaveLength(2);
    for (const side of [-1, 1]) {
      const ray = (x: number) =>
        new THREE.Raycaster(
          new THREE.Vector3(x, PREACHING_CROSS_HEAD_BASE + 1.55, side),
          new THREE.Vector3(0, 0, -side)
        );
      const recess = ray(0).intersectObjects(model.pickables)[0],
        edge = ray(0.11).intersectObjects(model.pickables)[0];
      expect(recess.object.name).toBe("incised-cross-floor");
      expect(edge.object.name).toBe("carved-cross-face");
      expect(Math.abs(edge.point.z) - Math.abs(recess.point.z)).toBeCloseTo(0.0248, 4);
      const core = model.pickables.find(m => m.name === "bevelled-stone-cross-head")!;
      expect(ray(0).intersectObject(core).length).toBeGreaterThan(0);
    }
  } finally {
    model.dispose();
  }
});

it("owns a bounded compact High and preserves all three independently selectable part ranges", () => {
  const high = definition.variants![1],
    first = high.create(),
    second = high.create(),
    parts = definition.parts!(high.id);
  try {
    const size = new THREE.Box3().setFromObject(first.group).getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(definition.size[0]);
    expect(size.z).toBeLessThan(definition.size[1]);
    expect(size.y).toBeLessThan(definition.size[2]);
    expect(collectModelMetrics(first.group).triangles).toBeLessThan(1500);
    expect(collectModelMetrics(first.group).meshes).toBeLessThanOrEqual(4);
    expect(parts.map(p => p.role)).toEqual(["stepped-base", "shaft", "cross-head"]);
    const counts = new Map<string, number>();
    for (const mesh of first.pickables) {
      for (const name of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
      let offset = 0;
      for (const range of mesh.userData.modelPartRanges as ModelPartRange[]) {
        expect(range.start).toBe(offset);
        offset += range.count;
        counts.set(range.partId, (counts.get(range.partId) ?? 0) + range.count / 3);
      }
      expect(offset).toBe(mesh.geometry.getAttribute("position").count);
      expect(second.pickables.some(m => m.geometry === mesh.geometry || m.material === mesh.material)).toBe(false);
    }
    const ledger = modelParts(first.group);
    expect(ledger).toHaveLength(3);
    for (const p of ledger) expect(counts.get(p.id)).toBe(p.triangles);
    const spies = parts.map(p => vi.spyOn(p, "create")),
      solo = definition.assembleParts!([parts[2]]);
    try {
      for (const [i, spy] of spies.entries()) expect(spy).toHaveBeenCalledTimes(i === 2 ? 1 : 0);
    } finally {
      solo.dispose();
    }
    const owned = new Set(first.pickables.flatMap(m => [m.geometry, ...[m.material].flat()])),
      disposal = [...owned].map(r => vi.spyOn(r, "dispose"));
    first.dispose();
    for (const spy of disposal) expect(spy).toHaveBeenCalledTimes(1);
  } finally {
    second.dispose();
  }
});
