import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { adopt } from "../../city3d/adoption";
import { collectModelMetrics } from "../../model-viewer/modelMetrics";
import {
  createOpusTrireme,
  OPUS_TRIREME,
  OPUS_TRIREME_BANKS,
  OPUS_TRIREME_QUALITIES,
  type OpusTriremeQuality,
  type OpusTriremeState,
  opusTriremeParts,
  opusTriremePivot,
  opusTriremeRooms
} from "./opusTrireme";
import { SHIP_VARIANTS } from "./shipVariants";

const part = (id: string, state: OpusTriremeState = {}, quality: OpusTriremeQuality = "high") => {
  const model = opusTriremeParts(quality, state)
    .find(entry => entry.id === id)!
    .create();
  model.group.updateMatrixWorld(true);
  return model;
};
const named = (model: { pickables: THREE.Mesh[] }, name: string) => model.pickables.filter(mesh => mesh.name === name);
const boundsOf = (objects: THREE.Object3D[]) =>
  objects.reduce((box, object) => box.union(new THREE.Box3().setFromObject(object)), new THREE.Box3());

it.each(OPUS_TRIREME_QUALITIES)("fills the Olympias envelope with three banks of 170 oars (%s)", quality => {
  const model = createOpusTrireme(quality);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(OPUS_TRIREME.length);
  expect(bounds.max.x - bounds.min.x).toBeGreaterThan(OPUS_TRIREME.length * 0.98);
  expect(bounds.max.y).toBeLessThanOrEqual(OPUS_TRIREME.height);
  expect(bounds.max.y).toBeGreaterThan(OPUS_TRIREME.height - 0.2);
  expect(bounds.min.y).toBeGreaterThanOrEqual(-OPUS_TRIREME.draft);
  for (const mesh of model.pickables)
    expect([...mesh.geometry.getAttribute("position").array].every(Number.isFinite), mesh.name).toBe(true);
  model.dispose();
  const oars = part("oars", {}, quality);
  for (const bank of OPUS_TRIREME_BANKS) expect(named(oars, `oar-${bank.id}`)).toHaveLength(bank.perSide * 2);
  expect(OPUS_TRIREME.thranites + OPUS_TRIREME.zygites + OPUS_TRIREME.thalamites).toBe(OPUS_TRIREME.oars);
  oars.dispose();
  const hull = part("hull", {}, quality);
  const outrigger = part("outrigger", {}, quality);
  // The ram leads the ship on the waterline; the outriggers set the published beam.
  const ram = boundsOf(named(hull, "ram"));
  expect(ram.min.y).toBeLessThan(0);
  expect(ram.max.y).toBeGreaterThan(0);
  expect(ram.max.x).toBeCloseTo(new THREE.Box3().setFromObject(hull.group).max.x, 1);
  const rig = boundsOf(named(outrigger, "parexeiresia"));
  expect(rig.max.z).toBeLessThanOrEqual(OPUS_TRIREME.beam / 2);
  expect(rig.max.z).toBeGreaterThan(OPUS_TRIREME.beam / 2 - 0.05);
  hull.dispose();
  outrigger.dispose();
});

it("keeps the hull and its fixed structure identical in every sail and oar state", () => {
  const fixed = ["hull", "interior", "decks", "outrigger", "fittings"];
  const fingerprint = (state: OpusTriremeState) =>
    fixed.map(id => {
      const model = part(id, state);
      const hash = landmarkFingerprint(model.group);
      model.dispose();
      return hash;
    });
  const base = fingerprint({});
  for (const sails of ["set", "furled", "struck"] as const)
    for (const oars of ["out", "stowed"] as const) expect(fingerprint({ sails, oars })).toEqual(base);
});

it("stacks the banks thranite over zygite over thalamite and stows every oar run in", () => {
  const height = (bank: (typeof OPUS_TRIREME_BANKS)[number]) =>
    opusTriremeRooms(bank).reduce((sum, x) => sum + opusTriremePivot(bank.id, x, 1).y, 0) / bank.perSide;
  const [thranite, zygite, thalamite] = OPUS_TRIREME_BANKS.map(height);
  expect(thranite).toBeGreaterThan(zygite + 0.2);
  expect(zygite).toBeGreaterThan(thalamite + 0.5);
  expect(thalamite).toBeGreaterThan(0.3);
  const out = part("oars");
  for (const bank of OPUS_TRIREME_BANKS)
    for (const blade of named(out, `oar-${bank.id}`)) {
      const box = new THREE.Box3().setFromObject(blade);
      expect(Math.min(Math.abs(box.min.z), Math.abs(box.max.z)), bank.id).toBeGreaterThan(OPUS_TRIREME.beam / 2);
      expect(box.min.y, bank.id).toBeGreaterThan(-0.5);
      expect(box.max.y, bank.id).toBeGreaterThan(0);
    }
  const stowed = part("oars", { oars: "stowed" });
  expect(named(stowed, "oar-stowed")).toHaveLength(OPUS_TRIREME.oars);
  expect(stowed.pickables.some(mesh => mesh.name.startsWith("oar-thranite"))).toBe(false);
  const box = new THREE.Box3().setFromObject(stowed.group);
  expect(Math.max(-box.min.z, box.max.z)).toBeLessThan(OPUS_TRIREME.beam / 2 + 0.3);
  expect(box.min.y).toBeGreaterThan(0.3);
  out.dispose();
  stowed.dispose();
});

it("brails the sails to their yards and strikes the main mast onto the deck", () => {
  const sail = (state: OpusTriremeState, id: string) => {
    const model = part(id, state);
    const names = model.pickables.map(mesh => mesh.name);
    const box = new THREE.Box3().setFromObject(model.group);
    const hasSheet = model.group.getObjectByName("sheet") !== undefined;
    model.dispose();
    return { names, box, hasSheet };
  };
  const set = sail({}, "main-sail");
  expect(set.names).toContain("square-sail");
  expect(set.hasSheet).toBe(true);
  expect(set.box.max.y - set.box.min.y).toBeGreaterThan(7);
  const brailed = sail({ sails: "furled" }, "main-sail");
  expect(brailed.names).toContain("furled-sail");
  expect(brailed.hasSheet).toBe(false);
  expect(brailed.box.min.y).toBeGreaterThan(10);
  const struck = sail({ sails: "struck" }, "main-sail");
  expect(struck.box.max.y).toBeLessThan(3.6);
  expect(sail({ sails: "struck" }, "fore-sail").names).toContain("furled-sail");
  const stepped = part("spars");
  const lowered = part("spars", { sails: "struck" });
  const mast = (model: typeof stepped) => new THREE.Box3().setFromObject(named(model, "mast-main")[0]);
  expect(mast(stepped).max.y).toBeGreaterThan(OPUS_TRIREME.height - 0.4);
  expect(mast(lowered).max.y).toBeLessThan(3.2);
  expect(mast(lowered).max.x - mast(lowered).min.x).toBeGreaterThan(12);
  expect(named(lowered, "crutch-post").length).toBeGreaterThan(0);
  stepped.dispose();
  lowered.dispose();
});

it("keeps the low tier substantially lighter and releases every resource once", () => {
  const triangles = OPUS_TRIREME_QUALITIES.map(quality => {
    const model = createOpusTrireme(quality);
    const count = collectModelMetrics(model.group).triangles;
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    model.group.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
      resources.add(object.geometry);
      for (const material of [object.material].flat()) resources.add(material);
    });
    const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    model.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    return count;
  });
  expect(triangles[1]).toBeLessThan(triangles[0] * 0.6);
});

it("registers BV comparison tiers and leaves CE on the Grok 4.7 trireme", () => {
  const ids = SHIP_VARIANTS.filter(variant => variant.family === "ship.trireme").map(variant => variant.id);
  expect(ids).toContain("ship.trireme@high#claude-opus-5.5");
  expect(ids).toContain("ship.trireme@low#claude-opus-5.5");
  expect(adopt(SHIP_VARIANTS, "ship.trireme", "high").author).toBe("Grok 4.7");
});
