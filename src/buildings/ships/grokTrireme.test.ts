import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { adopt } from "../../city3d/adoption";
import { collectModelMetrics } from "../../model-viewer/modelMetrics";
import { type ModelPartRange, modelParts } from "../modelParts";
import { createGrokTrireme, GROK_TRIREME, grokTriremeParts, TRIREME_SAILS } from "./grokTrireme";
import { SHIP_VARIANTS } from "./shipVariants";

const part = (id: string, state: Parameters<typeof grokTriremeParts>[0] = {}) =>
  grokTriremeParts(state)
    .find(entry => entry.id === id)!
    .create();

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

const meanY = (meshes: THREE.Object3D[]) =>
  meshes.reduce((sum, mesh) => sum + new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()).y, 0) /
  meshes.length;

it("fills the advertised envelope and carries three oar banks and two square sails", () => {
  const model = createGrokTrireme();
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  const span = bounds.max.x - bounds.min.x;
  expect(span).toBeLessThanOrEqual(GROK_TRIREME.length);
  expect(span).toBeGreaterThan(GROK_TRIREME.length * 0.9);
  expect(bounds.max.y).toBeLessThanOrEqual(GROK_TRIREME.height);
  expect(bounds.max.y).toBeGreaterThan(GROK_TRIREME.height * 0.8);
  expect(bounds.min.y).toBeGreaterThanOrEqual(-GROK_TRIREME.draft - 0.02);
  expect(bounds.max.z - bounds.min.z).toBeGreaterThan(GROK_TRIREME.beam);
  expect(grokTriremeParts()).toHaveLength(9);
  for (const id of ["main-sail", "fore-sail"]) {
    const sail = part(id);
    expect(sail.pickables.some(mesh => mesh.name === "square-sail")).toBe(true);
    sail.dispose();
  }
  const oars = part("oars");
  expect(oars.pickables.filter(mesh => mesh.name === "oar-thranite")).toHaveLength(GROK_TRIREME.thranites);
  expect(oars.pickables.filter(mesh => mesh.name === "oar-zygite")).toHaveLength(GROK_TRIREME.zygites);
  expect(oars.pickables.filter(mesh => mesh.name === "oar-thalamite")).toHaveLength(GROK_TRIREME.thalamites);
  expect(GROK_TRIREME.thranites + GROK_TRIREME.zygites + GROK_TRIREME.thalamites).toBe(GROK_TRIREME.oars);
  expect(collectModelMetrics(model.group).triangles).toBeGreaterThan(8_000);
  oars.dispose();
  model.dispose();
});

it("keeps the hull, spars and rigging fixed across sail and oar states", () => {
  const fixed = ["hull", "decks", "fittings", "spars", "rigging", "flags"];
  const base = grokTriremeParts();
  const hashes = new Map(
    fixed.map(id => {
      const model = base.find(entry => entry.id === id)!.create();
      const hash = landmarkFingerprint(model.group);
      model.dispose();
      return [id, hash] as const;
    })
  );
  const oarsOut = part("oars", { oars: "out" });
  const oarHash = landmarkFingerprint(oarsOut.group);
  oarsOut.dispose();
  for (const sails of ["set", "furled"] as const)
    for (const oars of ["out", "stowed"] as const) {
      const parts = grokTriremeParts({ sails, oars });
      for (const id of fixed) {
        const model = parts.find(entry => entry.id === id)!.create();
        expect(landmarkFingerprint(model.group)).toBe(hashes.get(id));
        model.dispose();
      }
      if (oars === "out") {
        const posed = parts.find(entry => entry.id === "oars")!.create();
        expect(landmarkFingerprint(posed.group)).toBe(oarHash);
        posed.dispose();
      }
    }
});

it("ships three oar levels out past the outrigger and stows a different pose inboard", () => {
  const out = part("oars", { oars: "out" });
  out.group.updateMatrixWorld(true);
  expect(meanY(out.pickables.filter(mesh => mesh.name === "thranite-shaft"))).toBeGreaterThan(
    meanY(out.pickables.filter(mesh => mesh.name === "zygite-shaft")) + 0.08
  );
  expect(meanY(out.pickables.filter(mesh => mesh.name === "zygite-shaft"))).toBeGreaterThan(
    meanY(out.pickables.filter(mesh => mesh.name === "thalamite-shaft")) + 0.08
  );
  for (const name of ["oar-thranite", "oar-zygite", "oar-thalamite"])
    for (const blade of out.pickables.filter(mesh => mesh.name === name)) {
      const box = new THREE.Box3().setFromObject(blade);
      expect(Math.min(Math.abs(box.min.z), Math.abs(box.max.z)), name).toBeGreaterThan(GROK_TRIREME.beam / 2);
      expect(box.min.y, name).toBeGreaterThan(-GROK_TRIREME.draft - 0.02);
    }
  const stowed = part("oars", { oars: "stowed" });
  stowed.group.updateMatrixWorld(true);
  expect(stowed.pickables.filter(mesh => mesh.name === "oar-stowed")).toHaveLength(GROK_TRIREME.oars);
  expect(stowed.pickables.some(mesh => mesh.name.startsWith("oar-thranite"))).toBe(false);
  const box = new THREE.Box3().setFromObject(stowed.group);
  expect(Math.max(Math.abs(box.min.z), Math.abs(box.max.z))).toBeLessThan(1.6);
  expect(box.min.y).toBeGreaterThan(1.35);
  expect(landmarkFingerprint(out.group)).not.toBe(landmarkFingerprint(stowed.group));
  out.dispose();
  stowed.dispose();
});

it("ties the main course to its yard and drops the sheets", () => {
  const spec = TRIREME_SAILS[0];
  const heel = new THREE.Vector3(...spec.yardA);
  const peak = new THREE.Vector3(...spec.yardB);
  for (const sails of ["set", "furled"] as const) {
    const sail = part("main-sail", { sails });
    sail.group.updateMatrixWorld(true);
    const cloth = sail.pickables.find(mesh => mesh.name === (sails === "furled" ? "furled-sail" : "square-sail"))!;
    const radius = yardRadius(cloth, heel, peak);
    if (sails === "set") expect(radius).toBeGreaterThan(2);
    else expect(radius).toBeLessThan(0.6);
    expect(sail.group.getObjectByName("sheet") === undefined).toBe(sails === "furled");
    sail.dispose();
  }
});

it("puts the ram on the waterline and beds the outrigger in the hull", () => {
  const hull = part("hull");
  const decks = part("decks");
  const fittings = part("fittings");
  const rigging = part("rigging");
  hull.group.updateMatrixWorld(true);
  decks.group.updateMatrixWorld(true);
  fittings.group.updateMatrixWorld(true);
  const ram = new THREE.Box3();
  for (const mesh of hull.pickables.filter(
    item => item.name === "ram" || item.name === "ram-head" || item.name === "ram-fin"
  ))
    ram.expandByObject(mesh);
  expect(ram.min.y).toBeLessThan(0.05);
  expect(ram.max.y).toBeGreaterThan(0);
  expect(ram.min.y).toBeGreaterThan(-0.6);
  expect(ram.max.x).toBeGreaterThan(18);
  expect(hull.pickables.filter(mesh => mesh.name === "ophthalmos")).toHaveLength(2);
  expect(hull.pickables.filter(mesh => mesh.name === "aphlaston").length).toBeGreaterThan(0);
  const rail = decks.pickables.find(mesh => mesh.name === "parexeiresia")!;
  expect(Math.abs(new THREE.Box3().setFromObject(rail).getCenter(new THREE.Vector3()).z)).toBeCloseTo(
    GROK_TRIREME.beam / 2,
    1
  );
  const braces = decks.pickables.filter(mesh => mesh.name === "outrigger-brace");
  expect(braces.length).toBeGreaterThan(20);
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
  const steering = new THREE.Box3();
  for (const mesh of fittings.pickables.filter(item => item.name === "steering-oar" || item.name === "steering-blade"))
    steering.expandByObject(mesh);
  expect(steering.min.y).toBeLessThan(0.05);
  expect(steering.min.y).toBeGreaterThanOrEqual(-GROK_TRIREME.draft - 0.02);
  expect(fittings.pickables.filter(mesh => mesh.name === "steering-oar")).toHaveLength(2);
  expect(rigging.group.getObjectByName("hypozoma")).toBeTruthy();
  hull.dispose();
  decks.dispose();
  fittings.dispose();
  rigging.dispose();
});

describe.each(["set", "furled"] as const)("sails %s", sails => {
  it.each(["out", "stowed"] as const)("owns every part and releases resources with oars %s", oars => {
    const model = createGrokTrireme({ sails, oars });
    const ids = new Set(modelParts(model.group).map(entry => entry.id));
    expect(ids.size).toBe(grokTriremeParts().length);
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
        expect(ranges.reduce((sum, range) => sum + range.count, 0)).toBe(draw.geometry.getAttribute("position").count);
      }
    });
    const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    model.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});

it("registers a BV-only high variant and leaves the other ships on their CE choices", () => {
  const variants = SHIP_VARIANTS.filter(entry => entry.family === "ship.trireme" && entry.author === "Grok 4.7");
  expect(variants.map(entry => entry.id)).toEqual(["ship.trireme@high#grok-4.7"]);
  expect(adopt(SHIP_VARIANTS, "ship.trireme", "high").author).toBe("Grok 4.7");
  expect(variants[0]?.author).toBe("Grok 4.7");
  expect(SHIP_VARIANTS.filter(entry => entry.family === "ship.galley").map(entry => entry.id)).toEqual([
    "ship.galley@high#grok-4.7"
  ]);
  expect(adopt(SHIP_VARIANTS, "ship.galleon", "default").author).toBe("Codex GPT-6.1 Sol");
  expect(adopt(SHIP_VARIANTS, "ship.galleon", "high").author).toBe("Codex GPT-6.1 Sol");
  expect(adopt(SHIP_VARIANTS, "ship.sloop", "default").author).toBe("Codex GPT-6.1 Sol");
});
