import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import { adoptedVariant } from "../../city3d/adoption";
import { type ModelPartRange, modelParts } from "../modelParts";
import { CEMETERY_VARIANTS } from "../siteVariants";
import { models } from "./44-cemetery-facilitiesModels";
import {
  BONE_SHELF_LEVELS,
  boneRackPartFactories,
  createOssuaryRack,
  createOssuarySkull,
  ossuaryPartFactories
} from "./ossuaryParts";

const targets = models.filter(m => ["ossuary-charnel-house", "skull-shelf"].includes(m.id));
it("registers two real High models in their shared cemetery families and preserves Low/default shapes", () => {
  const hashes = [
    "94d0b7b61f5a4941221a8934e4275b90d9bc20b822ef2cf58e6a4ac83aa89bba",
    "4d38fd15a599a10e70564738fa636df3f1235f8c39d2a409d91ce39e5baa5320"
  ];
  expect(targets.map(m => m.id)).toEqual(["ossuary-charnel-house", "skull-shelf"]);
  for (const [i, definition] of targets.entries()) {
    expect(definition.variants!.map(v => v.level)).toEqual(["low", "high"]);
    const family = definition.variants![1].family;
    expect(adoptedVariant(family, "high").id).toBe(definition.variants![1].id);
    const low = definition.variants![0].create(),
      legacy = CEMETERY_VARIANTS.find(v => v.family === family && v.level === "default")!.create();
    try {
      expect(landmarkFingerprint(low.group)).toBe(hashes[i]);
      expect(landmarkFingerprint(legacy.group)).toBe(hashes[i]);
    } finally {
      low.dispose();
      legacy.dispose();
    }
  }
  for (const definition of models.filter(m => !m.variants))
    expect(
      CEMETERY_VARIANTS.filter(v => v.family === `cemetery.${definition.id.replaceAll("-", "_")}`).map(v => v.level)
    ).toEqual(["default"]);
});

it("provides a clear doorway and ventilating apertures rather than painted dark patches", () => {
  const parts = ossuaryPartFactories(),
    body = parts.find(p => p.role === "architecture")!.create(),
    door = parts.find(p => p.role === "door")!.create(),
    grilles = parts.find(p => p.role === "vent-grilles")!.create();
  try {
    for (const m of [body, door, grilles]) m.group.updateMatrixWorld(true);
    for (const y of [0.5, 1.2, 1.8]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(0, y, 3), new THREE.Vector3(0, 0, -1), 0, 1.9);
      expect(ray.intersectObjects(body.pickables)).toHaveLength(0);
      expect(ray.intersectObjects(door.pickables)).toHaveLength(0);
    }
    for (const x of [-1.8, 1.8]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x + 0.09, 1.6, 2.5), new THREE.Vector3(0, 0, -1), 0, 0.8);
      expect(ray.intersectObjects(body.pickables)).toHaveLength(0);
      expect(ray.intersectObjects(grilles.pickables)).toHaveLength(0);
    }
    expect(grilles.pickables.filter(m => m.name === "vent-vertical-bar")).toHaveLength(21);
  } finally {
    body.dispose();
    door.dispose();
    grilles.dispose();
  }
});

it("pierces the eye and nasal sockets and recesses their back rather than closing them at the face", () => {
  const model = createOssuarySkull();
  try {
    model.group.updateMatrixWorld(true);
    const face = model.pickables.find(m => m.name === "pierced-skull-face")!,
      bowl = model.pickables.find(m => m.name === "open-backed-skull-bowl")!;
    for (const [x, y] of [
      [-0.062, 0.214],
      [0.062, 0.214],
      [0, 0.145]
    ]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 0.3), new THREE.Vector3(0, 0, -1));
      expect(ray.intersectObject(face)).toHaveLength(0);
      expect(ray.intersectObject(bowl)[0].point.z).toBeLessThan(0.04);
    }
    expect(new THREE.Box3().setFromObject(model.group).min.y).toBeCloseTo(0);
  } finally {
    model.dispose();
  }
});

it("supports the stored remains on shelves and uses the exact shared rack inside the building", () => {
  const rack = createOssuaryRack(),
    fitted = ossuaryPartFactories()
      .find(p => p.role === "bone-racks")!
      .create();
  try {
    rack.group.updateMatrixWorld(true);
    const jaws = rack.pickables.filter(m => m.name === "skull-lower-jaw");
    expect(jaws).toHaveLength(9);
    for (const jaw of jaws)
      expect(BONE_SHELF_LEVELS.some(y => Math.abs(new THREE.Box3().setFromObject(jaw).min.y - y - 0.05) < 1e-5)).toBe(
        true
      );
    for (const bone of rack.pickables.filter(m => m.name === "bone-joint"))
      expect(BONE_SHELF_LEVELS.some(y => Math.abs(new THREE.Box3().setFromObject(bone).min.y - y - 0.05) < 1e-5)).toBe(
        true
      );
    expect(fitted.group.children).toHaveLength(2);
    for (const child of fitted.group.children) {
      expect(child.position.y).toBeCloseTo(0.16);
      child.position.set(0, 0, 0);
      expect(landmarkFingerprint(child)).toBe(landmarkFingerprint(rack.group));
    }
  } finally {
    rack.dispose();
    fitted.dispose();
  }
});

it("keeps the racks inside the room and separate from the ventilation and entry circulation", () => {
  const parts = ossuaryPartFactories(),
    racks = parts.find(p => p.role === "bone-racks")!.create();
  try {
    const bounds = new THREE.Box3().setFromObject(racks.group);
    expect(bounds.min.x).toBeGreaterThan(-2.78);
    expect(bounds.max.x).toBeLessThan(2.78);
    expect(bounds.min.z).toBeGreaterThan(-1.78);
    expect(bounds.max.z).toBeLessThan(-0.9);
    expect(bounds.max.y).toBeLessThan(3.2);
    expect(bounds.min.y).toBeCloseTo(0.16);
  } finally {
    racks.dispose();
  }
});

it("keeps bounded independent resources and complete outer part ranges for both High assemblies", () => {
  for (const definition of targets) {
    const variant = definition.variants![1],
      first = variant.create(),
      second = variant.create(),
      parts = definition.parts!(variant.id);
    try {
      expect(parts).toHaveLength(definition.id === "skull-shelf" ? 2 : 5);
      const ledger = modelParts(first.group);
      expect(ledger).toHaveLength(parts.length);
      const bounds = new THREE.Box3().setFromObject(first.group),
        size = bounds.getSize(new THREE.Vector3());
      expect(bounds.min.y).toBeCloseTo(0);
      expect(size.x).toBeLessThan(definition.size[0]);
      expect(size.z).toBeLessThan(definition.size[1]);
      expect(size.y).toBeLessThan(definition.size[2]);
      expect(collectModelMetrics(first.group).triangles).toBeLessThan(definition.id === "skull-shelf" ? 12000 : 45000);
      const counts = new Map<string, number>();
      for (const mesh of first.pickables) {
        expect(second.pickables.some(m => m.geometry === mesh.geometry || m.material === mesh.material)).toBe(false);
        for (const name of ["position", "normal"])
          expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
        let offset = 0;
        for (const range of mesh.userData.modelPartRanges as ModelPartRange[]) {
          expect(range.start).toBe(offset);
          offset += range.count;
          counts.set(range.partId, (counts.get(range.partId) ?? 0) + range.count / 3);
        }
        expect(offset).toBe(mesh.geometry.getAttribute("position").count);
      }
      for (const part of ledger) expect(counts.get(part.id)).toBe(part.triangles);
      const spies = parts.map(p => vi.spyOn(p, "create")),
        solo = definition.assembleParts!([parts[0]]);
      try {
        for (const [i, spy] of spies.entries()) expect(spy).toHaveBeenCalledTimes(i === 0 ? 1 : 0);
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
  }
  expect(boneRackPartFactories().every(p => p.quality === "high")).toBe(true);
});
