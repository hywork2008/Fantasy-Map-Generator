import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { variantId } from "../modelVariants";
import { DEDICATED_TANNERY } from "./dedicatedTanneryProfile";
import { ModelKit } from "./modelKit";
import { addTanneryDryingFrame, addTanneryVat } from "./tanneryDetails";

function site() {
  const k = new ModelKit("tannery-yard");
  k.box("level-yard-surface", [0, 0.025, 0], [18, 0.05, 16], "earth");
  return k.finish();
}
function shelter(high: boolean) {
  const k = new ModelKit("tannery-open-fleshing-shelter");
  for (const x of [-7.8, -3.5])
    for (const z of [1.4, 6.6]) {
      k.box("shelter-post", [x, 1.55, z], [0.14, 3, 0.14]);
      if (high) k.beam("shelter-brace", [x, 2.4, z], [x + (x < -5 ? 0.5 : -0.5), 3, z], 0.08);
    }
  k.roof(-5.65, 4, 4.8, 5.7, 3.15, 1, "wood", false);
  return k.finish();
}
/** Hollow basin. End openings accept the channel; vessel contents move by hand. */
function basin(k: ModelKit, name: string, x: number, w: number, dirty = false) {
  k.box(`${name}-floor`, [x, 0.15, -3], [w, 0.2, 2], "stone");
  for (const dx of [-w / 2, w / 2]) k.box(`${name}-side`, [x + dx, 0.5, -3], [0.12, 0.7, 2], "stone");
  k.box(`${name}-front`, [x, 0.5, -2.05], [w, 0.7, 0.12], "stone");
  for (const dx of [-1, 1])
    k.box(`${name}-rear-shoulder`, [x + dx * (w / 4 + 0.15), 0.5, -3.95], [w / 2 - 0.3, 0.7, 0.12], "stone");
  k.box(`${name}-recessed-liquid`, [x, 0.4, -3], [w - 0.15, 0.02, 1.78], dirty ? "earth" : "water");
}
function wetProcess() {
  const k = new ModelKit("tannery-wet-process");
  basin(k, "wash-basin", -7.5, 1.25);
  basin(k, "effluent-receiver", 7.5, 1.25, true);
  for (const [i, x] of [-2, 1, 4].entries()) {
    const vat = new ModelKit(i ? "bark-tanning-vat" : "liming-vat");
    addTanneryVat(vat, x, i > 0);
    k.attach(vat.finish(), [0, 0.05, -3]);
  }
  k.vessel("manual-transfer-pail", [6, 0.05, -3], 0.24, 0.5, "wood");
  k.beam("pail-handle", [5.76, 0.55, -3], [6.24, 0.55, -3], 0.03, "iron");
  return k.finish();
}
function channels() {
  const k = new ModelKit("tannery-separated-water-channels");
  for (const [x, name] of [
    [-7.5, "intake"],
    [7.5, "effluent"]
  ] as const) {
    k.box(`${name}-bed`, [x, 0.125, -6], [0.6, 0.15, 4], "stone");
    for (const dx of [-0.35, 0.35]) k.box(`${name}-wall`, [x + dx, 0.3, -6], [0.1, 0.5, 4], "stone");
    k.box(`${name}-liquid`, [x, 0.3, -6], [0.6, 0.02, 4], name === "intake" ? "water" : "earth");
  }
  return k.finish();
}
function fleshing() {
  const k = new ModelKit("tannery-fleshing-station");
  k.beam("rounded-fleshing-beam", [-6, 0.55, 3.3], [-4, 1.05, 3.3], 0.28, "wood", true);
  for (const x of [-5.8, -4.2])
    for (const dz of [-0.35, 0.35]) k.beam("fleshing-trestle", [x, 0.05, 3.3 + dz], [x, x < -5 ? 0.6 : 1, 3.3], 0.08);
  k.beam("two-hand-knife", [-5.5, 0.97, 3.5], [-4.7, 0.97, 3.5], 0.035, "iron");
  for (const x of [-5.55, -4.65]) k.beam("knife-grip", [x, 0.97, 3.45], [x, 0.97, 3.65], 0.05);
  return k.finish();
}
function drying() {
  const k = new ModelKit("tannery-drying-frames");
  for (const [i, x] of [2.5, 5.5].entries()) addTanneryDryingFrame(k, x, 3.55, i);
  return k.finish();
}
function stock(dry: boolean) {
  const k = new ModelKit(dry ? "tannery-dry-stock" : "tannery-raw-stock");
  const x = dry ? 5.3 : -6;
  k.box("raised-hide-pallet", [x, 0.15, 6], [2.4, 0.2, 0.8]);
  for (let i = 0; i < 4; i++)
    k.box(dry ? "dry-folded-hide" : "raw-folded-hide", [x, 0.3 + i * 0.09, 6], [1.6, 0.08, 0.7], "leather");
  return k.finish();
}
function materials() {
  const k = new ModelKit("tannery-prepared-materials-and-solid-waste");
  for (const [x, name, surface] of [
    [-2.5, "covered-lime", "white"],
    [0, "prepared-bark", "oak"],
    [2.2, "solid-waste", "dark"]
  ] as const) {
    k.vessel(name, [x, 0.05, -6], 0.55, 0.7, "wood");
    k.cylinder(`${name}-contents`, [x, 0.5, -6], 0.48, 0.02, surface);
    if (name === "covered-lime") k.cylinder("lime-lid", [x, 0.78, -6], 0.57, 0.06, "wood");
  }
  return k.finish();
}
export function dedicatedTanneryParts(quality: "low" | "high"): ModelPartFactory[] {
  const parts = [
    { role: "site", create: site },
    { role: "shelter", create: () => shelter(quality === "high") },
    { role: "wet-process", create: wetProcess },
    { role: "water-channels", create: channels },
    { role: "fleshing", create: fleshing },
    { role: "drying", create: drying },
    { role: "raw-stock", create: () => stock(false) },
    { role: "dry-stock", create: () => stock(true) },
    { role: "materials", create: materials }
  ];
  return parts.map(p => ({
    id: `dedicated-wet-tannery:${p.role}`,
    ...p,
    quality,
    author: DEFAULT_AUTHOR,
    ...(["wet-process", "drying"].includes(p.role)
      ? { basedOn: [variantId("medieval.tanners-yard", "high", DEFAULT_AUTHOR)] }
      : {})
  }));
}
export function assembleDedicatedTannery(
  quality: "low" | "high",
  parts: readonly ModelPartFactory[] = dedicatedTanneryParts(quality)
) {
  const model = compactModel(createModelAssembly(`dedicated-wet-tannery-${quality}`, parts), {
    mergeEquivalentMaterials: true
  });
  model.group.userData.placementSpec = DEDICATED_TANNERY;
  return model;
}
