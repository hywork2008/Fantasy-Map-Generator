import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { landmarkFingerprint } from "../../../scripts/lib/landmarkFingerprint.mts";
import { adopt } from "../../city3d/adoption";
import { collectModelMetrics } from "../../model-viewer/modelMetrics";
import { type ModelPartRange, modelParts } from "../modelParts";
import {
  createGeminiTrireme,
  GEMINI_TRIREME,
  GEMINI_TRIREME_BANKS,
  GEMINI_TRIREME_QUALITIES,
  type GeminiTriremeQuality,
  type GeminiTriremeState,
  geminiTriremeParts,
  geminiTriremePivot,
  geminiTriremeRooms
} from "./geminiTrireme";
import { SHIP_VARIANTS } from "./shipVariants";

const part = (id: string, state: GeminiTriremeState = {}, quality: GeminiTriremeQuality = "high") => {
  const model = geminiTriremeParts(quality, state)
    .find(entry => entry.id === id)!
    .create();
  model.group.updateMatrixWorld(true);
  return model;
};

const named = (model: { pickables: THREE.Mesh[] }, name: string) => model.pickables.filter(mesh => mesh.name === name);
const boundsOf = (objects: THREE.Object3D[]) =>
  objects.reduce((box, object) => box.union(new THREE.Box3().setFromObject(object)), new THREE.Box3());

it.each(GEMINI_TRIREME_QUALITIES)("fills the Olympias envelope with three banks of 170 oars (%s)", quality => {
  const model = createGeminiTrireme(quality);
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(GEMINI_TRIREME.length);
  expect(bounds.max.x - bounds.min.x).toBeGreaterThan(GEMINI_TRIREME.length * 0.98);
  expect(bounds.max.y).toBeLessThanOrEqual(GEMINI_TRIREME.height);
  expect(bounds.max.y).toBeGreaterThan(GEMINI_TRIREME.height - 0.25);
  expect(bounds.min.y).toBeGreaterThanOrEqual(-GEMINI_TRIREME.draft);
  const ids = new Set(modelParts(model.group).map(entry => entry.id));
  expect(ids.size).toBe(geminiTriremeParts(quality).length);
  for (const mesh of model.pickables) {
    expect([...mesh.geometry.getAttribute("position").array].every(Number.isFinite), mesh.name).toBe(true);
    const ranges = mesh.userData.modelPartRanges as ModelPartRange[];
    expect(ranges.every(range => ids.has(range.partId))).toBe(true);
    expect(ranges.reduce((sum, range) => sum + range.count, 0)).toBe(mesh.geometry.getAttribute("position").count);
  }
  model.dispose();

  const oars = part("oars", {}, quality);
  for (const bank of GEMINI_TRIREME_BANKS) expect(named(oars, `oar-${bank.id}`)).toHaveLength(bank.perSide * 2);
  expect(GEMINI_TRIREME.thranites + GEMINI_TRIREME.zygites + GEMINI_TRIREME.thalamites).toBe(GEMINI_TRIREME.oars);
  oars.dispose();

  const hull = part("hull", {}, quality);
  const outrigger = part("outrigger", {}, quality);
  const ram = boundsOf(named(hull, "ram"));
  expect(ram.min.y).toBeLessThan(0);
  expect(ram.max.y).toBeGreaterThan(0);
  expect(ram.max.x).toBeCloseTo(new THREE.Box3().setFromObject(hull.group).max.x, 1);
  const rig = boundsOf(named(outrigger, "parexeiresia"));
  expect(rig.max.z).toBeLessThanOrEqual(GEMINI_TRIREME.beam / 2);
  expect(rig.max.z).toBeGreaterThan(GEMINI_TRIREME.beam / 2 - 0.05);
  hull.dispose();
  outrigger.dispose();
});

it("keeps fixed structural parts identical across all sail and oar states", () => {
  const fixed = ["hull", "interior", "decks", "outrigger", "fittings"];
  const fingerprint = (state: GeminiTriremeState) =>
    fixed.map(id => {
      const model = part(id, state);
      const hash = landmarkFingerprint(model.group);
      model.dispose();
      return hash;
    });
  const base = fingerprint({});
  for (const sails of ["set", "furled", "struck"] as const) {
    for (const oars of ["out", "stowed"] as const) expect(fingerprint({ sails, oars })).toEqual(base);
  }
});

it("stacks the three oar banks in height order and stows every oar inboard", () => {
  const meanPivotY = (bank: (typeof GEMINI_TRIREME_BANKS)[number]) =>
    geminiTriremeRooms(bank).reduce((sum, x) => sum + geminiTriremePivot(bank.id, x, 1).y, 0) / bank.perSide;
  const [thranite, zygite, thalamite] = GEMINI_TRIREME_BANKS.map(meanPivotY);
  expect(thranite).toBeGreaterThan(zygite + 0.2);
  expect(zygite).toBeGreaterThan(thalamite + 0.5);
  expect(thalamite).toBeGreaterThan(0.3);

  const out = part("oars");
  for (const bank of GEMINI_TRIREME_BANKS) {
    for (const blade of named(out, `oar-${bank.id}`)) {
      const box = new THREE.Box3().setFromObject(blade);
      expect(Math.min(Math.abs(box.min.z), Math.abs(box.max.z)), bank.id).toBeGreaterThan(GEMINI_TRIREME.beam / 2);
      expect(box.min.y, bank.id).toBeGreaterThan(-0.5);
      expect(box.max.y, bank.id).toBeGreaterThan(0);
    }
  }
  const stowed = part("oars", { oars: "stowed" });
  expect(named(stowed, "oar-stowed")).toHaveLength(GEMINI_TRIREME.oars);
  expect(stowed.pickables.some(mesh => mesh.name.startsWith("oar-thranite"))).toBe(false);
  const box = new THREE.Box3().setFromObject(stowed.group);
  expect(Math.max(-box.min.z, box.max.z)).toBeLessThan(GEMINI_TRIREME.beam / 2 + 0.3);
  expect(box.min.y).toBeGreaterThan(0.3);
  out.dispose();
  stowed.dispose();
});

it("brails the sails to their yards and strikes the main mast onto deck crutches", () => {
  const inspectSail = (state: GeminiTriremeState, id: string) => {
    const model = part(id, state);
    const names = model.pickables.map(mesh => mesh.name);
    const box = new THREE.Box3().setFromObject(model.group);
    const hasSheet = model.group.getObjectByName("sheet") !== undefined;
    model.dispose();
    return { names, box, hasSheet };
  };
  const set = inspectSail({}, "main-sail");
  expect(set.names).toContain("square-sail");
  expect(set.hasSheet).toBe(true);
  expect(set.box.max.y - set.box.min.y).toBeGreaterThan(7);

  const furled = inspectSail({ sails: "furled" }, "main-sail");
  expect(furled.names).toContain("furled-sail");
  expect(furled.hasSheet).toBe(false);
  expect(furled.box.min.y).toBeGreaterThan(10);

  const struck = inspectSail({ sails: "struck" }, "main-sail");
  expect(struck.box.max.y).toBeLessThan(3.6);
  expect(inspectSail({ sails: "struck" }, "fore-sail").names).toContain("furled-sail");

  const stepped = part("spars");
  const lowered = part("spars", { sails: "struck" });
  const mastBox = (model: typeof stepped) => new THREE.Box3().setFromObject(named(model, "mast-main")[0]);
  expect(mastBox(stepped).max.y).toBeGreaterThan(GEMINI_TRIREME.height - 0.4);
  expect(mastBox(lowered).max.y).toBeLessThan(3.2);
  expect(mastBox(lowered).max.x - mastBox(lowered).min.x).toBeGreaterThan(12);
  expect(named(lowered, "crutch-post").length).toBeGreaterThan(0);
  stepped.dispose();
  lowered.dispose();
});

it("keeps the low tier substantially lighter and disposes every resource once", () => {
  const triangles = GEMINI_TRIREME_QUALITIES.map(quality => {
    const model = createGeminiTrireme(quality);
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

it("registers Gemini 4 Neon comparison tiers and keeps CE on Grok 4.7 High", () => {
  const ids = SHIP_VARIANTS.filter(variant => variant.family === "ship.trireme").map(variant => variant.id);
  expect(ids).toContain("ship.trireme@high#gemini-4-neon");
  expect(ids).toContain("ship.trireme@low#gemini-4-neon");
  expect(adopt(SHIP_VARIANTS, "ship.trireme", "high").author).toBe("Grok 4.7");
});
