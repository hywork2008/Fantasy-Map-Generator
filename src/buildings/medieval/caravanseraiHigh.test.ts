import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { medievalDefinition } from "../../city3d/adoption";
import { type ModelPartRange, modelParts } from "../modelParts";
import { models } from "./42-caravanseraisModels";
import {
  CARAVAN_GALLERY_TOP,
  CARAVAN_STAIR,
  CARAVAN_STAIR_POSITION,
  caravanStairLayout,
  caravanseraiPartFactories
} from "./caravanseraiParts";
import { createExteriorStair } from "./exteriorStair";
import { createHighFodderTrough } from "./troughDetails";

const definition = models[0];
it("preserves the original Low geometry and default identity and registers explicit High", () => {
  expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
  expect(medievalDefinition(definition).variant).toBe("medieval.balkan-caravanserai@default#codex-gpt-6.1-sol");
  const low = definition.variants![0].create();
  try {
    expect(landmarkFingerprint(low.group)).toBe("74a4297400e9c30dc2badf66cff81dbc2efaf8438da625541709754ae2f0e6d0");
  } finally {
    low.dispose();
  }
});

it("reuses the shared stair and preserves the filled manger while offering the empty detailed body", () => {
  const stair = caravanseraiPartFactories()
    .find(p => p.role === "exterior-stair")!
    .create();
  const reference = createExteriorStair(CARAVAN_STAIR),
    filled = createHighFodderTrough(),
    empty = createHighFodderTrough({ filled: false });
  try {
    stair.group.children[0].position.set(0, 0, 0);
    stair.group.children[0].rotation.set(0, 0, 0);
    expect(landmarkFingerprint(stair.group)).toBe(landmarkFingerprint(reference.group));
    expect(landmarkFingerprint(filled.group)).toBe("2b736a4239b0aedae8028d3b029c17291d2397c94535e6eb0ec3859e0040d17c");
    expect(collectModelMetrics(filled.group).triangles - collectModelMetrics(empty.group).triangles).toBe(12600);
    expect(CARAVAN_STAIR_POSITION[1] + CARAVAN_STAIR.rise).toBeCloseTo(CARAVAN_GALLERY_TOP);
    expect(CARAVAN_STAIR_POSITION[0] + caravanStairLayout().landingWidth / 2).toBeCloseTo(6.45);
  } finally {
    stair.dispose();
    reference.dispose();
    filled.dispose();
    empty.dispose();
  }
});

it("keeps the complete entry open and roofs the vault above a standing person", () => {
  const gate = caravanseraiPartFactories()
    .find(p => p.role === "gateway")!
    .create();
  try {
    gate.group.updateMatrixWorld(true);
    for (const x of [-1.2, 0, 1.2])
      for (const y of [0.5, 1.7, 2.4])
        expect(
          new THREE.Raycaster(new THREE.Vector3(x, y, 14), new THREE.Vector3(0, 0, -1), 0, 7).intersectObjects(
            gate.pickables
          )
        ).toHaveLength(0);
    const ceiling = new THREE.Raycaster(new THREE.Vector3(0, 3, 10), new THREE.Vector3(0, 1, 0)).intersectObjects(
      gate.pickables
    )[0];
    expect(ceiling.point.y).toBeCloseTo(4.46);
  } finally {
    gate.dispose();
  }
});

it("joins the stair and all three galleries with clear guards, level floors and accessible upper doors", () => {
  const parts = caravanseraiPartFactories();
  const galleries = parts.find(p => p.role === "galleries")!.create(),
    stair = parts.find(p => p.role === "exterior-stair")!.create(),
    lodging = parts.find(p => p.role === "lodging")!.create();
  const down = new THREE.Vector3(0, -1, 0);
  try {
    for (const model of [galleries, stair, lodging]) model.group.updateMatrixWorld(true);
    const decks = galleries.pickables.filter(m => m.name === "gallery-continuous-deck");
    for (const [x, z] of [
      [6.5, 4.3],
      [7.5, 0],
      [7.5, -6.3],
      [6.4, -6.3],
      [0, -6.3],
      [-6.4, -6.3],
      [-7.5, -6.3],
      [-7.5, 4]
    ]) {
      const hit = new THREE.Raycaster(new THREE.Vector3(x, 4.5, z), down).intersectObjects(decks)[0];
      expect(hit?.point.y).toBeCloseTo(3);
    }
    const landing = new THREE.Raycaster(new THREE.Vector3(6.4, 4.5, 4.3), down).intersectObjects(stair.pickables)[0];
    expect(landing.point.y).toBeCloseTo(3);
    for (const model of [galleries, stair])
      expect(
        new THREE.Raycaster(new THREE.Vector3(6.1, 3.7, 4.3), new THREE.Vector3(1, 0, 0), 0, 0.8).intersectObjects(
          model.pickables
        )
      ).toHaveLength(0);
    expect(
      new THREE.Raycaster(new THREE.Vector3(7.5, 3.7, -6.3), new THREE.Vector3(-1, 0, 0), 0, 15).intersectObjects(
        galleries.pickables
      )
    ).toHaveLength(0);
    expect(
      new THREE.Raycaster(new THREE.Vector3(1.625, 3.8, -6.2), new THREE.Vector3(0, 0, -1), 0, 2.4).intersectObjects(
        lodging.pickables
      )
    ).toHaveLength(0);
    expect(
      new THREE.Raycaster(new THREE.Vector3(7.5, 3.8, 3.35), new THREE.Vector3(1, 0, 0), 0, 2).intersectObjects(
        lodging.pickables
      )
    ).toHaveLength(0);
  } finally {
    galleries.dispose();
    stair.dispose();
    lodging.dispose();
  }
});

it("keeps eight independent High parts, bounded finite compact geometry and one-time resource disposal", () => {
  const high = definition.variants![1],
    first = high.create(),
    second = high.create(),
    parts = definition.parts!(high.id);
  try {
    expect(parts).toHaveLength(8);
    expect(parts.every(p => p.quality === "high")).toBe(true);
    const bounds = new THREE.Box3().setFromObject(first.group),
      size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(0);
    expect(size.x).toBeLessThan(definition.size[0]);
    expect(size.z).toBeLessThan(definition.size[1]);
    expect(size.y).toBeLessThan(definition.size[2]);
    const metrics = collectModelMetrics(first.group);
    expect(metrics.triangles).toBeLessThan(65000);
    expect(metrics.meshes).toBeLessThanOrEqual(14);
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
    expect(ledger).toHaveLength(8);
    for (const part of ledger) expect(counts.get(part.id)).toBe(part.triangles);
    expect(ledger.find(p => p.role === "animal-equipment")!.basedOn).toContain(
      "medieval.fodder-trough@high#codex-gpt-6.1-sol"
    );
    const spies = parts.map(p => vi.spyOn(p, "create")),
      solo = definition.assembleParts!([parts[3]]);
    try {
      for (const [i, spy] of spies.entries()) expect(spy).toHaveBeenCalledTimes(i === 3 ? 1 : 0);
    } finally {
      solo.dispose();
    }
    const resources = new Set(first.pickables.flatMap(m => [m.geometry, ...[m.material].flat()])),
      disposal = [...resources].map(r => vi.spyOn(r, "dispose"));
    first.dispose();
    for (const spy of disposal) expect(spy).toHaveBeenCalledTimes(1);
  } finally {
    second.dispose();
  }
});
