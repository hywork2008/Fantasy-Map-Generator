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

it.each(GEMINI_TRIREME_QUALITIES)(
  "fills the Olympias envelope with authentic hull, canopy and 170 oars (%s)",
  quality => {
    const model = createGeminiTrireme(quality);
    const bounds = new THREE.Box3().setFromObject(model.group);
    expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(GEMINI_TRIREME.length);
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(GEMINI_TRIREME.length * 0.98);
    expect(bounds.max.y).toBeLessThanOrEqual(GEMINI_TRIREME.height);
    expect(bounds.max.y).toBeGreaterThan(GEMINI_TRIREME.height - 0.35);
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
    const decks = part("decks", {}, quality);
    const fittings = part("fittings", {}, quality);

    // Piraeus bronze ram straddles the waterline with no secondary proembolion.
    const ram = boundsOf(named(hull, "ram"));
    expect(ram.min.y).toBeLessThan(0);
    expect(ram.max.y).toBeGreaterThan(0);
    expect(ram.max.x).toBeCloseTo(new THREE.Box3().setFromObject(hull.group).max.x, 1);
    expect(named(hull, "proembolion")).toHaveLength(0);

    // Slender 3.65 m moulded hull, 5.45 m outriggers and broad 4.5 m canopy deck with central gangway.
    const hullPlanking = boundsOf(named(hull, "hull-planking"));
    expect(hullPlanking.max.z - hullPlanking.min.z).toBeCloseTo(GEMINI_TRIREME.hullBeam, 1);
    const rig = boundsOf(named(outrigger, "parexeiresia"));
    expect(rig.max.z).toBeLessThanOrEqual(GEMINI_TRIREME.beam / 2 + 0.01);
    expect(rig.max.z).toBeGreaterThan(GEMINI_TRIREME.beam / 2 - 0.06);
    const canopy = boundsOf(named(decks, "katastroma"));
    expect(canopy.max.z - canopy.min.z).toBeCloseTo(GEMINI_TRIREME.canopyBeam, 1);
    expect(named(decks, "central-gangway").length).toBeGreaterThan(0);

    // Twin aft-raked steering oars mounted in stern outrigger housings (no transverse rudder-beam).
    expect(named(fittings, "rudder-beam")).toHaveLength(0);
    expect(named(fittings, "pedalion")).toHaveLength(2);
    expect(named(fittings, "tiller-yoke")).toHaveLength(1);
    const rudders = boundsOf(named(fittings, "pedalion-blade"));
    expect(rudders.min.y).toBeLessThan(-0.4);
    expect(rudders.min.y).toBeGreaterThanOrEqual(-GEMINI_TRIREME.draft);

    hull.dispose();
    outrigger.dispose();
    decks.dispose();
    fittings.dispose();
  }
);

it("seats every outrigger brace into the hull and keeps fixed parts invariant across states", () => {
  const hull = part("hull");
  const outrigger = part("outrigger");
  const braces = named(outrigger, "outrigger-brace");
  expect(braces.length).toBeGreaterThan(20);
  for (const brace of braces) {
    const s = new THREE.Vector3(0, -0.5, 0).applyMatrix4(brace.matrixWorld);
    const e = new THREE.Vector3(0, 0.5, 0).applyMatrix4(brace.matrixWorld);
    const hits = new THREE.Raycaster(s, e.clone().sub(s).normalize(), 0, s.distanceTo(e) + 0.05).intersectObjects(
      hull.pickables
    );
    expect(hits.length).toBeGreaterThan(0);
  }
  hull.dispose();
  outrigger.dispose();

  const fixed = ["hull", "interior", "outrigger", "decks", "fittings"];
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
  expect(thranite).toBeGreaterThan(zygite + 0.25);
  expect(zygite).toBeGreaterThan(thalamite + 0.5);
  expect(thalamite).toBeGreaterThan(0.3);

  const out = part("oars");
  for (const bank of GEMINI_TRIREME_BANKS) {
    for (const blade of named(out, `oar-${bank.id}`)) {
      const box = new THREE.Box3().setFromObject(blade);
      expect(Math.min(Math.abs(box.min.z), Math.abs(box.max.z)), bank.id).toBeGreaterThan(GEMINI_TRIREME.beam / 2);
      expect(box.min.y, bank.id).toBeGreaterThan(-0.55);
      expect(box.max.y, bank.id).toBeGreaterThan(0);
    }
  }
  const stowed = part("oars", { oars: "stowed" });
  expect(named(stowed, "oar-stowed")).toHaveLength(GEMINI_TRIREME.oars);
  expect(stowed.pickables.some(mesh => mesh.name.startsWith("oar-thranite"))).toBe(false);
  const box = new THREE.Box3().setFromObject(stowed.group);
  expect(Math.max(-box.min.z, box.max.z)).toBeLessThan(GEMINI_TRIREME.beam / 2 + 0.35);
  expect(box.min.y).toBeGreaterThan(0.25);
  out.dispose();
  stowed.dispose();
});

it("carries a 13 m main yard, brails the sails and strikes the main mast onto deck crutches", () => {
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
  expect(set.box.max.z - set.box.min.z).toBeGreaterThan(12);
  expect(set.box.max.y - set.box.min.y).toBeGreaterThan(7);

  const furled = inspectSail({ sails: "furled" }, "main-sail");
  expect(furled.names).toContain("furled-sail");
  expect(furled.hasSheet).toBe(false);
  expect(furled.box.min.y).toBeGreaterThan(9.8);

  const struck = inspectSail({ sails: "struck" }, "main-sail");
  expect(struck.box.max.y).toBeLessThan(3.3);
  expect(inspectSail({ sails: "struck" }, "fore-sail").names).toContain("furled-sail");

  const stepped = part("spars");
  const yardBounds = boundsOf(named(stepped, "yard"));
  expect(yardBounds.max.z - yardBounds.min.z).toBeCloseTo(GEMINI_TRIREME.mainYardLength, 0);
  const lowered = part("spars", { sails: "struck" });
  const mastBox = (model: typeof stepped) => new THREE.Box3().setFromObject(named(model, "mast-main")[0]);
  expect(mastBox(stepped).max.y).toBeGreaterThan(GEMINI_TRIREME.height - 0.4);
  expect(mastBox(lowered).max.y).toBeLessThan(3.0);
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
