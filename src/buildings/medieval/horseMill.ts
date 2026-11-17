import type { Author } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { ModelKit, type Position } from "./modelKit";

export const HORSE_MILL_AUTHOR: Author = "Claude Opus 5.5";

/** Animal-powered grain mill: no sails and no water wheel, so it stands on any dry outskirts plot. */
export const HORSE_MILL = {
  formId: "dedicated-horse-mill",
  /** Building footprint and roof overhang in meters, centred on the origin. */
  width: 12,
  depth: 11,
  eave: 3.2,
  /** Front cart door on the +z wall. */
  main: { position: [0, 0, 5.5] as const, clearWidth: 2.2 }
} as const;

const W = HORSE_MILL.width,
  D = HORSE_MILL.depth,
  EAVE = HORSE_MILL.eave;
/** The horse walk is centred behind the door so the shaft and sweep clear the cart entry. */
const SHAFT: readonly [number, number] = [-1, -0.8];
const SWEEP = 3.6;

function shell(high: boolean) {
  const k = new ModelKit("horse-mill-house");
  k.hall(0, 0, W, D, EAVE, 2.6, { wall: "plaster", roof: high ? "tile" : "thatch", door: 2.2 });
  if (high) {
    for (const x of [-W / 2 + 0.15, W / 2 - 0.15])
      k.beam("corner-brace", [x, 0.4, D / 2 - 0.05], [x, EAVE - 0.3, D / 2 - 1.4], 0.12);
    k.box("hay-loft-door", [W / 2 - 2.2, EAVE + 0.9, D / 2 + 0.38], [1.1, 0.9, 0.06], "wood");
  }
  return k.finish();
}
function horseWalk() {
  const k = new ModelKit("horse-mill-walk");
  k.cylinder("trodden-horse-walk", [SHAFT[0], 0.255, SHAFT[1]], SWEEP + 0.7, 0.03, "earth", SWEEP + 0.7, 32);
  k.cylinder("walk-kerb", [SHAFT[0], 0.29, SHAFT[1]], SWEEP + 0.8, 0.06, "stone", SWEEP + 0.8, 32);
  k.cylinder("inner-walk", [SHAFT[0], 0.3, SHAFT[1]], SWEEP - 0.7, 0.06, "earth", SWEEP - 0.7, 32);
  return k.finish();
}
/** Stones stand outside the horse walk on the +x side, driven by a layshaft above the sweep. */
const STONES: readonly [number, number] = [4.8, SHAFT[1]];
const LAYSHAFT_Y = 2.75;
function gearing(high: boolean) {
  const k = new ModelKit("horse-mill-gearing");
  const [x, z] = SHAFT;
  k.cylinder("upright-shaft", [x, EAVE / 2 + 0.1, z], 0.18, EAVE - 0.2, "oak", 0.18, 8);
  k.box("shaft-footstep-stone", [x, 0.33, z], [0.6, 0.1, 0.6], "stone");
  k.box("shaft-head-beam", [x, EAVE - 0.05, z], [0.26, 0.26, D - 0.4]);
  // Crown wheel on the upright shaft; its pegs turn the layshaft pinion that runs to the stones.
  k.ring("crown-wheel-rim", [x, 2.45, z], 1.5, 0.1, "oak");
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4;
    k.beam(
      "crown-wheel-arm",
      [x - Math.cos(a) * 1.5, 2.45, z - Math.sin(a) * 1.5],
      [x + Math.cos(a) * 1.5, 2.45, z + Math.sin(a) * 1.5],
      0.12
    );
  }
  if (high)
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12;
      k.box("crown-wheel-cog", [x + Math.cos(a) * 1.5, 2.58, z + Math.sin(a) * 1.5], [0.06, 0.18, 0.06], "oak");
    }
  k.beam("layshaft", [x + 1.2, LAYSHAFT_Y, z], [STONES[0], LAYSHAFT_Y, z], 0.14, "oak", true);
  k.cylinder("layshaft-pinion", [x + 1.5, LAYSHAFT_Y, z], 0.25, 0.25, "oak", 0.25, 8).rotation.z = Math.PI / 2;
  // The sweep is low enough to harness a horse and passes under the crown wheel and layshaft.
  const sweepEnd: Position = [x + SWEEP, 1.3, z];
  k.beam("horse-sweep", [x, 1.6, z], sweepEnd, 0.16);
  k.beam("sweep-stay", [x, 2.25, z], [x + SWEEP * 0.6, 1.42, z], 0.08);
  k.beam("harness-swingletree", [x + SWEEP, 1.25, z - 0.4], [x + SWEEP, 1.25, z + 0.4], 0.07, "wood", true);
  return k.finish();
}
function stones(high: boolean) {
  const k = new ModelKit("horse-mill-stones");
  const [x, z] = STONES;
  // Raised hurst frame carrying the stone pair, clear of the horse walk.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) k.box("hurst-post", [x + sx * 0.7, 0.65, z + sz * 0.7], [0.18, 1.3, 0.18]);
  k.box("hurst-floor", [x, 1.3, z], [1.6, 0.12, 1.6], "wood");
  k.cylinder("bed-stone", [x, 1.48, z], 0.62, 0.24, "stone");
  k.cylinder("runner-stone", [x, 1.72, z], 0.6, 0.22, "stone");
  k.cylinder("stone-eye", [x, 1.84, z], 0.1, 0.02, "dark");
  k.cylinder("stone-spindle", [x, 2.3, z], 0.06, 0.9, "iron");
  k.cylinder("spindle-bevel-wheel", [x, LAYSHAFT_Y - 0.25, z], 0.32, 0.12, "oak", 0.32, 12);
  k.box("hopper", [x, 2.05, z + 0.25], [0.6, 0.35, 0.6], "wood");
  k.box("meal-spout", [x, 1.2, z + 0.95], [0.18, 0.18, 0.4], "wood");
  k.box("meal-bin", [x, 0.4, z + 1.35], [1, 0.5, 0.5], "wood");
  if (high) {
    k.beam("tentering-lever", [x - 0.7, 1.05, z - 0.7], [x + 0.7, 1.05, z - 0.7], 0.06);
    k.box("stone-crane-post", [x + 0.75, 1.3, z - 0.75], [0.14, 2.6, 0.14]);
  }
  return k.finish();
}
function stores() {
  const k = new ModelKit("horse-mill-grain-stores");
  for (let i = 0; i < 6; i++)
    k.sphere(
      "grain-sack",
      [-W / 2 + 0.75 + (i % 3) * 0.7, 0.55 + Math.floor(i / 3) * 0.5, D / 2 - 1.1],
      [0.32, 0.3, 0.26],
      "cloth"
    );
  for (let i = 0; i < 4; i++)
    k.sphere("flour-sack", [W / 2 - 0.8, 0.55, -D / 2 + 1 + i * 0.75], [0.28, 0.32, 0.26], "white");
  k.box("sack-pallet", [W / 2 - 0.8, 0.28, -D / 2 + 2.1], [0.9, 0.08, 3.2], "wood");
  k.box("weigh-beam-post", [W / 2 - 1.6, 1.1, D / 2 - 1.1], [0.14, 2.2, 0.14]);
  k.beam("weigh-beam", [W / 2 - 2.3, 2.1, D / 2 - 1.1], [W / 2 - 0.9, 2.1, D / 2 - 1.1], 0.07, "wood");
  return k.finish();
}
function manger() {
  const k = new ModelKit("horse-mill-manger");
  k.box("hay-manger", [-W / 2 + 0.6, 0.65, -D / 2 + 1.2], [0.7, 0.6, 1.8], "wood");
  k.box("manger-hay", [-W / 2 + 0.6, 0.98, -D / 2 + 1.2], [0.55, 0.12, 1.6], "straw");
  k.vessel("water-trough", [-W / 2 + 0.6, 0.25, -D / 2 + 2.8], 0.35, 0.5, "wood", true);
  return k.finish();
}

export function horseMillParts(quality: "low" | "high"): ModelPartFactory[] {
  const high = quality === "high";
  const parts: { role: string; create: ModelPartFactory["create"] }[] = [
    { role: "shell", create: () => shell(high) },
    { role: "horse-walk", create: horseWalk },
    { role: "gearing", create: () => gearing(high) },
    { role: "millstones", create: () => stones(high) },
    { role: "grain-stores", create: stores },
    { role: "manger", create: manger }
  ];
  return parts.map(p => ({ id: `horse-mill:${p.role}`, ...p, quality, author: HORSE_MILL_AUTHOR }));
}
export function assembleHorseMill(
  quality: "low" | "high",
  parts: readonly ModelPartFactory[] = horseMillParts(quality)
) {
  return compactModel(createModelAssembly(`horse-mill-${quality}`, parts), { mergeEquivalentMaterials: true });
}
