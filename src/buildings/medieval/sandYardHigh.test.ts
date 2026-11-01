import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { medievalDefinition } from "../../city3d/adoption";
import { type ModelPartRange, modelParts } from "../modelParts";
import { models } from "./40-sand-yardsModels";
import { createHighHandCart } from "./handCartDetails";
import { sandYardPartFactories } from "./sandYardParts";

const definition = models[0];
it("registers explicit High while preserving Low geometry and CE default identity", () => {
  expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
  expect(medievalDefinition(definition).variant).toBe("medieval.sand-storage-yard@default#codex-gpt-6.1-sol");
  const low = definition.variants![0].create();
  try {
    expect(landmarkFingerprint(low.group)).toBe("a9465d965b7b03902fd3e0f39342e50d19da3427ce8e051a12e66708df89c359");
  } finally {
    low.dispose();
  }
});

it("uses the existing High barrow and records the shared container as Low", () => {
  const parts = sandYardPartFactories(),
    factory = parts.find(p => p.role === "wheelbarrow")!;
  const fitted = factory.create(),
    reference = createHighHandCart("wooden-wheelbarrow");
  try {
    fitted.group.position.set(-2, -0.08, -3);
    expect(landmarkFingerprint(fitted.group)).toBe(landmarkFingerprint(reference.group));
    expect(factory.basedOn).toEqual(["medieval.wooden-wheelbarrow@high#codex-gpt-6.1-sol"]);
    const barrel = parts.find(p => p.role === "barrel")!;
    expect(barrel.quality).toBe("low");
    expect(barrel.basedOn).toEqual(["container.barrel-empty@default#codex-gpt-6.1-sol"]);
    expect(parts.filter(p => p.quality === "high")).toHaveLength(5);
  } finally {
    fitted.dispose();
    reference.dispose();
  }
});

it("keeps separated stock above its floor and within retaining walls with an open loading side", () => {
  const parts = sandYardPartFactories(),
    stock = parts.find(p => p.role === "sand-stock")!.create(),
    bays = parts.find(p => p.role === "retaining-bays")!.create();
  try {
    stock.group.updateMatrixWorld(true);
    bays.group.updateMatrixWorld(true);
    const piles = stock.pickables.filter(m => m.name === "sand-stockpile");
    expect(piles).toHaveLength(2);
    for (const [i, pile] of piles.entries()) {
      const box = new THREE.Box3().setFromObject(pile),
        x = [-3, 2][i];
      expect(box.min.y).toBeCloseTo(0.14);
      expect(box.min.x).toBeGreaterThan(x - 1.86);
      expect(box.max.x).toBeLessThan(x + 1.86);
      expect(box.min.z).toBeGreaterThan(-2.96);
      expect(box.max.z).toBeLessThan(1);
      expect(
        new THREE.Raycaster(new THREE.Vector3(x, 0.5, 2), new THREE.Vector3(0, 0, -1), 0, 0.95).intersectObjects(
          bays.pickables
        )
      ).toHaveLength(0);
      const hit = new THREE.Raycaster(new THREE.Vector3(x, 3, -1), new THREE.Vector3(0, -1, 0)).intersectObject(
        pile
      )[0];
      expect(hit.point.y).toBeCloseTo(1.39);
    }
    expect(collectModelMetrics(stock.group).triangles).toBeLessThan(2000);
  } finally {
    stock.dispose();
    bays.dispose();
  }
});

it("grounds the shovel and supports the sieve on the rack feet and crossbar", () => {
  const tools = sandYardPartFactories()
    .find(p => p.role === "loading-tools")!
    .create();
  try {
    tools.group.updateMatrixWorld(true);
    const boxes = (name: string) =>
      tools.pickables.filter(m => m.name === name).map(m => new THREE.Box3().setFromObject(m));
    expect(boxes("shovel-blade")[0].min.y).toBeCloseTo(0.08);
    for (const side of boxes("sieve-frame-side")) {
      expect(boxes("tool-rack-foot").some(foot => foot.intersectsBox(side))).toBe(true);
      expect(boxes("tool-rack-crossbar")[0].intersectsBox(side)).toBe(true);
    }
    expect(boxes("shovel-socket")[0].intersectsBox(boxes("shovel-haft")[0])).toBe(true);
    expect(boxes("shovel-socket")[0].intersectsBox(boxes("shovel-blade")[0])).toBe(true);
  } finally {
    tools.dispose();
  }
});

it("preserves six selectable part ranges, finite bounded geometry and independent resources", () => {
  const parts = sandYardPartFactories(),
    model = definition.variants![1].create(),
    other = definition.variants![1].create();
  try {
    const bounds = new THREE.Box3().setFromObject(model.group),
      size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(0);
    expect(size.x).toBeLessThan(definition.size[0]);
    expect(size.z).toBeLessThan(definition.size[1]);
    expect(size.y).toBeLessThan(definition.size[2]);
    expect(collectModelMetrics(model.group).triangles).toBeLessThan(30000);
    expect(collectModelMetrics(model.group).meshes).toBeLessThanOrEqual(16);
    const ledger = modelParts(model.group);
    expect(ledger).toHaveLength(6);
    const counts = new Map<string, number>();
    for (const mesh of model.pickables) {
      for (const key of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(key).array).every(Number.isFinite)).toBe(true);
      let offset = 0;
      for (const range of mesh.userData.modelPartRanges as ModelPartRange[]) {
        expect(range.start).toBe(offset);
        offset += range.count;
        counts.set(range.partId, (counts.get(range.partId) ?? 0) + range.count / 3);
      }
      expect(offset).toBe(mesh.geometry.getAttribute("position").count);
      expect(other.pickables.some(m => m.geometry === mesh.geometry || m.material === mesh.material)).toBe(false);
    }
    for (const part of ledger) expect(counts.get(part.id)).toBe(part.triangles);
    const spies = parts.map(p => vi.spyOn(p, "create"));
    const solo = definition.assembleParts!([parts[2]]);
    try {
      spies.forEach((spy, i) => {
        expect(spy).toHaveBeenCalledTimes(i === 2 ? 1 : 0);
      });
    } finally {
      solo.dispose();
    }
    const resources = new Set(model.pickables.flatMap(m => [m.geometry, ...[m.material].flat()]));
    const disposal = [...resources].map(r => vi.spyOn(r, "dispose"));
    model.dispose();
    for (const spy of disposal) expect(spy).toHaveBeenCalledTimes(1);
  } finally {
    other.dispose();
  }
});
