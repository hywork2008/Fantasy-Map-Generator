import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { adopt } from "../../city3d/adoption";
import { type ModelPartRange, modelParts } from "../modelParts";
import { createCaravel } from "./caravel";
import { createCarrack } from "./carrack";
import { createMerchantShipHigh, merchantShipParts } from "./merchantShipHigh";
import { assembleSailingParts } from "./sailingAssembly";
import { SHIP_VARIANTS } from "./shipVariants";

const lows = { caravel: createCaravel, carrack: createCarrack };
const hashes = {
  caravel: "6a2c19783cfb340d41ffda5462570826968020c04408908fc03c64d776dd4aa1",
  carrack: "a3f16cf9e1af045cd519f3f27d8cd1dbd97594d7e91bedfaa39052c864a2fafa"
};
describe.each(["caravel", "carrack"] as const)("%s", kind => {
  it("preserves the default Low shape, and leaves fixed High parts and flags unchanged across states", () => {
    const low = lows[kind]();
    expect(landmarkFingerprint(low.group)).toBe(hashes[kind]);
    low.dispose();
    const set = merchantShipParts(kind),
      furled = merchantShipParts(kind, { sails: "furled" });
    for (const factory of set.filter(
      p => !p.id.startsWith("square-") && !p.id.startsWith("lateen-") && p.id !== "mizzen"
    )) {
      const a = factory.create(),
        b = furled.find(p => p.id === factory.id)!.create();
      expect(landmarkFingerprint(a.group)).toBe(landmarkFingerprint(b.group));
      a.dispose();
      b.dispose();
    }
  });
  it("replaces every set sail with a three dimensional bundle and removes its sheets at both qualities", () => {
    for (const high of [false, true]) {
      const models = high
        ? merchantShipParts(kind, { sails: "furled" }).map(p => p.create())
        : [lows[kind]({ sails: "furled" })];
      const meshes = models.flatMap(m => m.pickables),
        bundles = meshes.filter(m => m.name === "furled-lateen" || m.name === "furled-square");
      expect(bundles).toHaveLength(kind === "caravel" ? 2 : 4);
      expect(meshes.some(m => m.name === "lateen-sail" || m.name === "square-sail")).toBe(false);
      for (const mesh of bundles) {
        const bounds = new THREE.Box3().setFromObject(mesh),
          size = bounds.getSize(new THREE.Vector3());
        expect(Math.min(size.x, size.y, size.z)).toBeGreaterThan(0.15);
      }
      for (const model of models) {
        model.group.traverse(object => expect(object.name).not.toMatch(/^(lateen|square)-sheet$/));
        model.dispose();
      }
    }
  });
  it("supports its castle walls on the hull and recesses its window panes", () => {
    const factory = merchantShipParts(kind).find(p => p.id === (kind === "caravel" ? "aft-cabin" : "sterncastle"))!;
    const model = factory.create();
    model.group.updateMatrixWorld(true);
    const x = kind === "caravel" ? -6.2 : -8,
      y = kind === "caravel" ? 2.5 : 5.5;
    const hits = new THREE.Raycaster(new THREE.Vector3(x + 1, y, 0), new THREE.Vector3(-1, 0, 0)).intersectObjects(
      model.pickables
    );
    expect(hits.some(hit => hit.object.name === "castle-skirt")).toBe(true);
    expect(model.pickables.some(m => m.name === "recessed-castle-window")).toBe(true);
    model.dispose();
  });
  it.each(["set", "furled"] as const)(
    "keeps finite bounded geometry, all part ranges and independently owned lines (%s)",
    sails => {
      const model = createMerchantShipHigh(kind, { sails }),
        ids = new Set(modelParts(model.group).map(p => p.id));
      expect(ids.size).toBe(kind === "caravel" ? 8 : 13);
      for (const mesh of model.pickables) {
        const ranges = mesh.userData.modelPartRanges as ModelPartRange[];
        expect(ranges.every(r => ids.has(r.partId))).toBe(true);
        expect(ranges.reduce((n, r) => n + r.count, 0)).toBe(mesh.geometry.getAttribute("position").count);
      }
      let lines = 0;
      const resources = new Set<THREE.BufferGeometry | THREE.Material>();
      model.group.traverse(object => {
        const draw = object as THREE.Mesh;
        if (!draw.isMesh && !(object as THREE.LineSegments).isLineSegments) return;
        expect([...draw.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
        resources.add(draw.geometry);
        for (const mat of [draw.material].flat()) resources.add(mat);
        if ((object as THREE.LineSegments).isLineSegments) {
          lines++;
          expect(ids.has(object.userData.modelPartId)).toBe(true);
        }
      });
      expect(lines).toBeGreaterThan(4);
      const box = new THREE.Box3().setFromObject(model.group);
      expect(box.min.y).toBeCloseTo(kind === "caravel" ? -1.8 : -3.5);
      expect(box.max.y).toBeLessThanOrEqual(kind === "caravel" ? 21 : 33);
      expect(box.max.z - box.min.z).toBeLessThanOrEqual(kind === "caravel" ? 7.5 : 18);
      for (const factory of merchantShipParts(kind, { sails })) {
        const solo = assembleSailingParts("solo", [factory]);
        expect(modelParts(solo.group).map(p => p.id)).toEqual([factory.id]);
        solo.dispose();
      }
      const spies = [...resources].map(r => vi.spyOn(r, "dispose"));
      model.dispose();
      for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    }
  );
  it("releases Low furled geometry and materials exactly once", () => {
    const model = lows[kind]({ sails: "furled" }),
      resources = new Set<THREE.BufferGeometry | THREE.Material>();
    model.group.traverse(object => {
      const draw = object as THREE.Mesh;
      if (!draw.isMesh && !(object as THREE.LineSegments).isLineSegments) return;
      resources.add(draw.geometry);
      for (const mat of [draw.material].flat()) resources.add(mat);
    });
    const spies = [...resources].map(r => vi.spyOn(r, "dispose"));
    model.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});

it("keeps the overlapping fore and aft lateen cloth on separate sides of the Caravel rig", () => {
  const parts = merchantShipParts("caravel").filter(part => part.id.startsWith("lateen-"));
  const models = parts.map(part => part.create());
  const bounds = models.map(model =>
    new THREE.Box3().setFromObject(model.pickables.find(mesh => mesh.name === "lateen-sail")!)
  );
  expect(bounds[0].min.z).toBeGreaterThan(bounds[1].max.z);
  for (const model of models) model.dispose();
});

it("registers explicit author tiers while preserving CE default adoption", () => {
  for (const kind of ["caravel", "carrack"] as const) {
    const family = `ship.${kind}`;
    expect(
      SHIP_VARIANTS.filter(v => v.family === family)
        .map(v => v.level)
        .sort()
    ).toEqual(["default", "high", "low"]);
    expect(adopt(SHIP_VARIANTS, family, "default").id).toBe(`${family}@default#codex-gpt-6.1-sol`);
  }
});
