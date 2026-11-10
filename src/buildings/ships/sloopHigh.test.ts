import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { type ModelPartRange, modelParts } from "../modelParts";
import { assembleSailingParts } from "./sailingAssembly";
import { createSloop } from "./sloop";
import { createSloopHigh, sloopHighParts } from "./sloopHigh";

it("preserves the legacy default mesh fingerprint", () => {
  const model = createSloop();
  expect(landmarkFingerprint(model.group)).toBe("e3a89818a2d191d5ec3f80d800f72a58e6376ebc850456db436291373565420d");
  model.dispose();
});

it("keeps the six fixed High parts identical between sailing states", () => {
  const set = sloopHighParts({ sails: "set" }),
    furled = sloopHighParts({ sails: "furled" });
  for (const part of set.slice(0, 6)) {
    const a = part.create(),
      b = furled.find(candidate => candidate.id === part.id)!.create();
    expect(landmarkFingerprint(a.group)).toBe(landmarkFingerprint(b.group));
    a.dispose();
    b.dispose();
  }
});

it("closes the lofted hull below the deck and keeps the cabin windows recessed", () => {
  const hull = sloopHighParts()[0].create();
  hull.group.updateMatrixWorld(true);
  for (const side of [-1, 1]) {
    const hits = new THREE.Raycaster(
      new THREE.Vector3(0, 0.6, side * 5),
      new THREE.Vector3(0, 0, -side)
    ).intersectObjects(hull.pickables);
    expect(hits.length).toBeGreaterThan(0);
  }
  expect(
    new THREE.Raycaster(new THREE.Vector3(0, -5, 0), new THREE.Vector3(0, 1, 0)).intersectObjects(hull.pickables).length
  ).toBeGreaterThan(0);
  hull.dispose();
  const cabin = sloopHighParts()
    .find(p => p.id === "cabin")!
    .create();
  cabin.group.updateMatrixWorld(true);
  const hits = new THREE.Raycaster(new THREE.Vector3(-2.7, 1.96, 3), new THREE.Vector3(0, 0, -1)).intersectObjects(
    cabin.pickables
  );
  expect(hits[0].object.name).toBe("window-mullion");
  const offCentre = new THREE.Raycaster(new THREE.Vector3(-2.6, 1.96, 3), new THREE.Vector3(0, 0, -1)).intersectObjects(
    cabin.pickables
  );
  expect(offCentre[0].object.name).toBe("recessed-window");
  expect(offCentre[0].point.z).toBeLessThan(0.95);
  cabin.dispose();
});

describe.each(["set", "furled"] as const)("%s", sails => {
  it("supports standalone assembly, keeps all semantic ranges and retains line geometry", () => {
    const model = createSloopHigh({ sails });
    expect(modelParts(model.group)).toHaveLength(8);
    const ids = new Set(modelParts(model.group).map(p => p.id));
    for (const mesh of model.pickables) {
      const ranges = mesh.userData.modelPartRanges as ModelPartRange[];
      expect(ranges.reduce((sum, r) => sum + r.count, 0)).toBe(mesh.geometry.getAttribute("position").count);
      expect(ranges.every(range => ids.has(range.partId))).toBe(true);
    }
    const lines: THREE.LineSegments[] = [];
    model.group.traverse(object => {
      if ((object as THREE.LineSegments).isLineSegments) lines.push(object as THREE.LineSegments);
    });
    expect(lines.some(line => line.name === "standing-rigging")).toBe(true);
    for (const line of lines) {
      expect(ids.has(line.userData.modelPartId)).toBe(true);
      expect([...line.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
    }
    const bounds = new THREE.Box3().setFromObject(model.group);
    expect(bounds.min.y).toBeCloseTo(-1.7);
    expect(bounds.max.y).toBeLessThanOrEqual(14);
    expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(4.4);
    for (const part of sloopHighParts({ sails })) {
      const solo = assembleSailingParts("solo", [part]);
      expect(solo.pickables.length).toBeGreaterThan(0);
      expect(modelParts(solo.group).map(p => p.id)).toEqual([part.id]);
      solo.dispose();
    }
    model.dispose();
  });

  it("owns and releases every rendered geometry and material exactly once", () => {
    for (const create of [() => createSloop({ sails }), () => createSloopHigh({ sails })]) {
      const model = create();
      const resources = new Set<THREE.BufferGeometry | THREE.Material>();
      model.group.traverse(object => {
        const draw = object as THREE.Mesh;
        if (!draw.isMesh && !(object as THREE.LineSegments).isLineSegments) return;
        resources.add(draw.geometry);
        for (const material of [draw.material].flat()) resources.add(material);
      });
      const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
      model.dispose();
      for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    }
  });
});

it("replaces both sails and removes obsolete jib sheets while lowering the gaff", () => {
  for (const high of [false, true]) {
    const model = high
      ? sloopHighParts({ sails: "furled" }).flatMap(p => {
          const m = p.create();
          return [m];
        })
      : [createSloop({ sails: "furled" })];
    const meshes = model.flatMap(m => m.pickables);
    expect(meshes.some(m => m.name === "gaff-mainsail" || m.name === "jib")).toBe(false);
    for (const name of ["furled-mainsail", "furled-jib"]) expect(meshes.some(m => m.name === name)).toBe(true);
    const gaff = meshes.find(m => m.name === "gaff")!;
    expect(gaff.position.y).toBeLessThan(3.7);
    const bundle = meshes.find(m => m.name === "furled-mainsail")!;
    const bounds = new THREE.Box3().setFromObject(bundle);
    expect(bounds.min.y).toBeLessThan(3.2);
    expect(bounds.max.y).toBeGreaterThan(3.5);
    for (const m of model) {
      m.group.traverse(object => expect(object.name).not.toBe("jib-sheets"));
      m.dispose();
    }
  }
});
