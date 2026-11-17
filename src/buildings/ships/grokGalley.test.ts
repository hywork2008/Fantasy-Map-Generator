import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { adopt } from "../../city3d/adoption";
import { collectModelMetrics } from "../../model-viewer/modelMetrics";
import { type ModelPartRange, modelParts } from "../modelParts";
import { createGrokGalley, GALLEY_LATEENS, GROK_GALLEY, galleyBowGuns, grokGalleyParts } from "./grokGalley";
import { SHIP_VARIANTS } from "./shipVariants";

const part = (id: string, state: Parameters<typeof grokGalleyParts>[0] = {}) =>
  grokGalleyParts(state)
    .find(entry => entry.id === id)!
    .create();

const mountBasis = (normal: THREE.Vector3) => {
  const n = normal.clone().normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(n);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  return { right, up: n.clone().cross(right).normalize(), normal: n };
};

const yardRadius = (mesh: THREE.Mesh, heel: THREE.Vector3, peak: THREE.Vector3) => {
  const axis = peak.clone().sub(heel);
  const lengthSq = axis.lengthSq();
  const position = mesh.geometry.getAttribute("position");
  let max = 0;
  for (let i = 0; i < position.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    const t = THREE.MathUtils.clamp(point.clone().sub(heel).dot(axis) / lengthSq, 0, 1);
    max = Math.max(max, point.distanceTo(heel.clone().addScaledVector(axis, t)));
  }
  return max;
};

it("fills the advertised envelope and carries the galley oars, lateens and bow guns", () => {
  const model = createGrokGalley();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  const span = bounds.max.x - bounds.min.x;
  expect(span).toBeLessThanOrEqual(GROK_GALLEY.length);
  expect(span).toBeGreaterThan(GROK_GALLEY.length * 0.9);
  expect(bounds.max.y).toBeLessThanOrEqual(GROK_GALLEY.height);
  expect(bounds.max.y).toBeGreaterThan(GROK_GALLEY.height * 0.8);
  expect(bounds.min.y).toBeGreaterThanOrEqual(-GROK_GALLEY.draft - 0.02);
  expect(bounds.max.z - bounds.min.z).toBeGreaterThan(GROK_GALLEY.beam);
  expect(grokGalleyParts()).toHaveLength(11);
  for (const id of ["fore-lateen", "main-lateen"]) {
    const sail = part(id);
    expect(sail.pickables.some(mesh => mesh.name === "lateen-sail")).toBe(true);
    sail.dispose();
  }
  const oars = part("oars");
  const guns = part("bow-guns");
  expect(oars.pickables.filter(mesh => mesh.name === "oar-out")).toHaveLength(GROK_GALLEY.oars);
  expect(guns.pickables.filter(mesh => mesh.name === "cannon-run-out")).toHaveLength(GROK_GALLEY.guns);
  expect(collectModelMetrics(model.group).triangles).toBeGreaterThan(6_000);
  oars.dispose();
  guns.dispose();
  model.dispose();
});

it("keeps the hull, spars, rigging and breastwork fixed across sail, oar and gun states", () => {
  const fixed = ["hull", "decks", "fittings", "spars", "rigging", "flags", "bow-frames"];
  const base = grokGalleyParts();
  const hashes = new Map(
    fixed.map(id => {
      const model = base.find(entry => entry.id === id)!.create();
      const hash = landmarkFingerprint(model.group);
      model.dispose();
      return [id, hash] as const;
    })
  );
  for (const sails of ["set", "furled"] as const)
    for (const oars of ["out", "stowed"] as const)
      for (const guns of ["run-out", "housed"] as const) {
        const parts = grokGalleyParts({ sails, oars, guns });
        for (const id of fixed) {
          const model = parts.find(entry => entry.id === id)!.create();
          expect(landmarkFingerprint(model.group)).toBe(hashes.get(id));
          model.dispose();
        }
      }
});

it("ships the oars out past the apostis and stows a different pose inboard", () => {
  const decks = part("decks");
  decks.group.updateMatrixWorld(true);
  const apostis = decks.pickables.find(mesh => mesh.name === "apostis")!;
  const apostisZ = Math.abs(new THREE.Box3().setFromObject(apostis).getCenter(new THREE.Vector3()).z);
  expect(apostisZ).toBeGreaterThan(GROK_GALLEY.beam / 2);
  const out = part("oars", { oars: "out" });
  out.group.updateMatrixWorld(true);
  const blades = out.pickables.filter(mesh => mesh.name === "oar-out");
  expect(blades).toHaveLength(48);
  for (const blade of blades) {
    const box = new THREE.Box3().setFromObject(blade);
    expect(Math.min(Math.abs(box.min.z), Math.abs(box.max.z))).toBeGreaterThan(apostisZ);
    expect(box.min.y).toBeGreaterThan(-GROK_GALLEY.draft - 0.02);
  }
  const stowed = part("oars", { oars: "stowed" });
  stowed.group.updateMatrixWorld(true);
  expect(stowed.pickables.filter(mesh => mesh.name === "oar-stowed")).toHaveLength(48);
  expect(stowed.pickables.some(mesh => mesh.name === "oar-out")).toBe(false);
  const box = new THREE.Box3().setFromObject(stowed.group);
  expect(Math.max(Math.abs(box.min.z), Math.abs(box.max.z))).toBeLessThan(GROK_GALLEY.beam / 2);
  expect(box.min.y).toBeGreaterThan(1.35);
  decks.dispose();
  out.dispose();
  stowed.dispose();
});

it("opens the bow battery forward and covers it when the guns are housed", () => {
  const guns = galleyBowGuns();
  expect(guns).toHaveLength(5);
  expect(guns.every(gun => gun.normal[0] === 1 && gun.normal[1] === 0 && gun.normal[2] === 0)).toBe(true);
  const frames = part("bow-frames");
  const housed = part("bow-guns", { guns: "housed" });
  const runOut = part("bow-guns", { guns: "run-out" });
  frames.group.updateMatrixWorld(true);
  housed.group.updateMatrixWorld(true);
  runOut.group.updateMatrixWorld(true);
  for (const gun of guns) {
    const point = new THREE.Vector3(...gun.point);
    const normal = new THREE.Vector3(...gun.normal);
    const { right, up } = mountBasis(normal);
    const through = new THREE.Raycaster(point.clone().addScaledVector(normal, 2), normal.clone().negate(), 0, 2.2);
    expect(through.intersectObjects(frames.pickables), gun.id).toHaveLength(0);
    const beside = point
      .clone()
      .addScaledVector(right, gun.width * 0.55)
      .addScaledVector(normal, 2.2);
    expect(
      new THREE.Raycaster(beside, normal.clone().negate(), 0, 3.4).intersectObjects(frames.pickables).length,
      gun.id
    ).toBeGreaterThan(0);
    for (const x of [-0.35, 0, 0.35])
      for (const y of [-0.35, 0, 0.35]) {
        const sample = point
          .clone()
          .addScaledVector(normal, 2)
          .addScaledVector(right, x * gun.width)
          .addScaledVector(up, y * gun.height);
        const hit = new THREE.Raycaster(sample, normal.clone().negate(), 0, 2.4).intersectObjects(
          housed.pickables.filter(mesh => mesh.name === "gun-lid-closed")
        );
        expect(hit.length, gun.id).toBeGreaterThan(0);
      }
  }
  for (const mesh of housed.pickables.filter(item => item.name === "cannon-housed")) {
    mesh.updateMatrixWorld(true);
    const position = mesh.geometry.getAttribute("position");
    let max = -Infinity;
    for (let i = 0; i < position.count; i++)
      max = Math.max(max, new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).x);
    expect(max).toBeLessThan(guns[0].point[0] - 0.15);
  }
  for (const mesh of runOut.pickables.filter(item => item.name === "cannon-run-out")) {
    mesh.updateMatrixWorld(true);
    const position = mesh.geometry.getAttribute("position");
    let max = -Infinity;
    for (let i = 0; i < position.count; i++)
      max = Math.max(max, new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).x);
    expect(max).toBeGreaterThan(guns[0].point[0] + 0.2);
  }
  frames.dispose();
  housed.dispose();
  runOut.dispose();
});

it("ties the main lateen to its yard and drops the sheet", () => {
  const spec = GALLEY_LATEENS.find(entry => entry.id === "main-lateen")!;
  const heel = new THREE.Vector3(...spec.heel);
  const peak = new THREE.Vector3(...spec.peak);
  for (const sails of ["set", "furled"] as const) {
    const sail = part("main-lateen", { sails });
    sail.group.updateMatrixWorld(true);
    const cloth = sail.pickables.find(mesh => mesh.name === (sails === "furled" ? "furled-sail" : "lateen-sail"))!;
    const radius = yardRadius(cloth, heel, peak);
    if (sails === "set") expect(radius).toBeGreaterThan(1.2);
    else expect(radius).toBeLessThan(0.6);
    expect(sail.group.getObjectByName("sheet") === undefined).toBe(sails === "furled");
    sail.dispose();
  }
});

it("keeps the spur above the water and beds the apostis braces in the hull", () => {
  const hull = part("hull");
  const decks = part("decks");
  hull.group.updateMatrixWorld(true);
  decks.group.updateMatrixWorld(true);
  const spur = new THREE.Box3();
  for (const mesh of hull.pickables.filter(item => item.name === "spur" || item.name === "spur-shoe"))
    spur.expandByObject(mesh);
  expect(spur.min.y).toBeGreaterThan(0.4);
  for (const z of [-0.72, 0, 0.72]) {
    const hit = new THREE.Raycaster(new THREE.Vector3(-22, 3.05, z), new THREE.Vector3(1, 0, 0), 0, 4).intersectObjects(
      decks.pickables
    );
    expect(hit[0]?.object.name, `window ${z}`).toBe("window-glass");
  }
  const braces = decks.pickables.filter(mesh => mesh.name === "apostis-brace");
  expect(braces).toHaveLength(48);
  for (const brace of braces) {
    const start = new THREE.Vector3(0, -0.5, 0).applyMatrix4(brace.matrixWorld);
    const end = new THREE.Vector3(0, 0.5, 0).applyMatrix4(brace.matrixWorld);
    const hits = new THREE.Raycaster(
      start,
      end.clone().sub(start).normalize(),
      0,
      start.distanceTo(end)
    ).intersectObjects(hull.pickables);
    expect(hits.length, `${start.x.toFixed(1)}`).toBeGreaterThan(0);
  }
  hull.dispose();
  decks.dispose();
});

describe.each(["set", "furled"] as const)("sails %s", sails => {
  it.each(["run-out", "housed"] as const)("owns every part and releases resources with bow guns %s", guns => {
    for (const oars of ["out", "stowed"] as const) {
      const model = createGrokGalley({ sails, oars, guns });
      const ids = new Set(modelParts(model.group).map(entry => entry.id));
      expect(ids.size).toBe(grokGalleyParts().length);
      const resources = new Set<THREE.BufferGeometry | THREE.Material>();
      model.group.traverse(object => {
        const draw = object as THREE.Mesh;
        if (!draw.isMesh && !(object as THREE.LineSegments).isLineSegments) return;
        resources.add(draw.geometry);
        for (const material of [draw.material].flat()) resources.add(material);
        expect([...draw.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
        if (draw.isMesh) {
          const ranges = draw.userData.modelPartRanges as ModelPartRange[];
          expect(ranges.every(range => ids.has(range.partId))).toBe(true);
          expect(ranges.reduce((sum, range) => sum + range.count, 0)).toBe(
            draw.geometry.getAttribute("position").count
          );
        }
      });
      const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
      model.dispose();
      for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    }
  });
});

it("registers a BV-only high variant and leaves the CE galleon on Codex", () => {
  const variants = SHIP_VARIANTS.filter(entry => entry.family === "ship.galley");
  expect(variants.map(entry => entry.id)).toEqual(["ship.galley@high#grok-4.7"]);
  expect(variants[0]?.author).toBe("Grok 4.7");
  expect(adopt(SHIP_VARIANTS, "ship.galleon", "default").author).toBe("Codex GPT-6.1 Sol");
  expect(adopt(SHIP_VARIANTS, "ship.galleon", "high").author).toBe("Codex GPT-6.1 Sol");
  expect(adopt(SHIP_VARIANTS, "ship.sloop", "default").author).toBe("Codex GPT-6.1 Sol");
});
