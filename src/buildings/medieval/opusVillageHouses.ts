import * as THREE from "three";
import type { BvDefinition } from "../../city3d/three/bvInstances";
import type { BuildingAppearanceProfile } from "../appearance/types";
import type { Author } from "../authors";
import { compactModel } from "../compactModel";
import { ModelKit, type Surface } from "./modelKit";

/**
 * Single-storey village buildings of the roadside village (docs/plan/ce-meshless-roadside-burgage-village.md §14):
 * the longhouse (home and byre under one roof, a cross-passage between them), the cottage of one or two rooms, and
 * the barn standing apart in the toft. CE fits each to its house's footprint, so the model takes its length and width
 * from the spec. Long side along x, the front (the road, or the yard for a barn) on +z, centred on the origin, ground
 * at y = 0. Walls are the footprint; the roof overhangs it.
 */
export const VILLAGE_HOUSE_AUTHOR: Author = "Claude Opus 5.5";

export const VILLAGE_HOUSE_KINDS = ["longhouse", "cottage", "barn"] as const;
export type VillageHouseKind = (typeof VILLAGE_HOUSE_KINDS)[number];
export type VillageHouseProfile = Exclude<BuildingAppearanceProfile, "legacy">;
export const VILLAGE_HOUSE_PROFILES: readonly VillageHouseProfile[] = [
  "atlantic",
  "northern-wooded",
  "northern-urban",
  "stone-upland",
  "mediterranean"
];

export interface VillageHouseSpec {
  kind: VillageHouseKind;
  profile: VillageHouseProfile;
  /** Wall length along the road (x) and depth (z), in metres. */
  length: number;
  width: number;
  /** Which end the dwelling, door and smoke hole take. */
  variant: 0 | 1 | 2;
}

/** The plan's sizes (§14.2): Hangleton 12 × 6 m longhouses and buildings under 9 m, Herefordshire 5 × 3.5 m cots. */
export const VILLAGE_HOUSE_PRESETS: Record<VillageHouseKind, { length: number; width: number }> = {
  longhouse: { length: 14, width: 5.5 },
  cottage: { length: 7, width: 4.2 },
  barn: { length: 8, width: 4.5 }
};
/** Sizes a spec may take: the plan's ranges with room for the fitted footprint's rounding. */
export const VILLAGE_HOUSE_LIMITS = { length: [3, 20], width: [3, 6.5] } as const;

interface ProfileLook {
  wall: Surface;
  /** Exposed oak frame or log courses over the wall fill. */
  frame?: "box" | "logs";
  roof: Surface;
  pitchDeg: number;
  /** Wall thickness: a wattle-and-daub or log wall is thin, a rubble wall thick. */
  wallMeters: number;
  /** Smoke escapes through a louver in the ridge, or a stone chimney stack in the south. */
  smoke: "louver" | "chimney";
  colors?: Partial<Record<Surface, number>>;
}
/**
 * Walls and roofs by region (§14.4): wattle and daub under thatch in England (Herefordshire, Hangleton), granite under
 * thatch in the uplands (Hound Tor), logs under shingles in the north, a framed Wohnstallhaus under thatch in
 * Germany, rubble under tiles in the south (no dimensions in the sources).
 */
const LOOKS: Record<VillageHouseProfile, ProfileLook> = {
  atlantic: { wall: "plaster", frame: "box", roof: "thatch", pitchDeg: 50, wallMeters: 0.3, smoke: "louver" },
  "northern-wooded": {
    wall: "wood",
    frame: "logs",
    roof: "wood",
    pitchDeg: 38,
    wallMeters: 0.3,
    smoke: "louver",
    colors: { wood: 0x7a5d3e }
  },
  "northern-urban": {
    wall: "plaster",
    frame: "box",
    roof: "thatch",
    pitchDeg: 48,
    wallMeters: 0.3,
    smoke: "louver",
    colors: { plaster: 0xc9b996 }
  },
  "stone-upland": {
    wall: "stone",
    roof: "thatch",
    pitchDeg: 45,
    wallMeters: 0.7,
    smoke: "louver",
    colors: { stone: 0x8f8a7e }
  },
  mediterranean: {
    wall: "stone",
    roof: "tile",
    pitchDeg: 22,
    wallMeters: 0.6,
    smoke: "chimney",
    colors: { stone: 0xc2ad8a }
  }
};

/** Low walls under a big roof (Hound Tor: about 2 m); a barn stands taller for its carts and sheaves. */
const EAVE_METERS: Record<VillageHouseKind, number> = { longhouse: 2.1, cottage: 2, barn: 2.8 };
const OVERHANG_METERS = 0.35;
const THATCH_METERS = 0.35;

const clamp = (v: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, v));

export function villageHouseSpecKey(spec: VillageHouseSpec): string {
  return [spec.kind, spec.profile, spec.length.toFixed(2), spec.width.toFixed(2), spec.variant].join("|");
}

/** The pitched roof as a solid of its thickness, ridge along x, with the gable walls closing its ends. */
function roofAndGables(k: ModelKit, look: ProfileLook, length: number, width: number, eave: number) {
  const half = width / 2 + OVERHANG_METERS,
    rise = Math.tan((look.pitchDeg * Math.PI) / 180) * (width / 2),
    thick = look.roof === "thatch" ? THATCH_METERS : 0.12,
    top = eave + rise,
    // The underside runs on the gable's slope through the wall heads and on out over the eaves, so no wall stands
    // through the roof; the cover lies on it at its own thickness.
    drip = eave - (rise / (width / 2)) * OVERHANG_METERS;
  const shape = new THREE.Shape();
  shape.moveTo(-half, drip);
  shape.lineTo(-half, drip + thick);
  shape.lineTo(0, top + thick);
  shape.lineTo(half, drip + thick);
  shape.lineTo(half, drip);
  shape.lineTo(0, top);
  shape.closePath();
  const roof = new THREE.ExtrudeGeometry(shape, { depth: length + 2 * OVERHANG_METERS, bevelEnabled: false });
  // The shape lies in (z, y); its extrusion runs along x.
  roof.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  roof.translate(-(length / 2 + OVERHANG_METERS), 0, 0);
  k.add("roof", roof, look.roof);
  for (const side of [-1, 1]) {
    const gable = new THREE.Shape();
    gable.moveTo(-width / 2, eave);
    gable.lineTo(0, top);
    gable.lineTo(width / 2, eave);
    gable.closePath();
    const wall = new THREE.ExtrudeGeometry(gable, { depth: look.wallMeters, bevelEnabled: false });
    wall.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    wall.translate(side > 0 ? length / 2 - look.wallMeters : -length / 2, 0, 0);
    k.add("gable-wall", wall, look.frame === "logs" ? "wood" : look.wall);
  }
  return { top: top + thick, rise, thick };
}

function walls(k: ModelKit, look: ProfileLook, length: number, width: number, eave: number) {
  const t = look.wallMeters;
  for (const side of [-1, 1]) {
    k.box("long-wall", [0, eave / 2, side * (width / 2 - t / 2)], [length, eave, t], look.wall);
    k.box("end-wall", [side * (length / 2 - t / 2), eave / 2, 0], [t, eave, width - 2 * t], look.wall);
  }
  if (look.wall !== "stone") k.box("stone-footing", [0, 0.15, 0], [length + 0.08, 0.3, width + 0.08], "stone");
}

/** Corner posts, wall plates and studs of a box frame; log courses with crossed corners for a log wall. */
function frame(k: ModelKit, look: ProfileLook, length: number, width: number, eave: number, high: boolean) {
  const outside = (side: number) => side * (width / 2 + 0.02);
  if (look.frame === "box") {
    const bays = Math.max(1, Math.round(length / (high ? 1.6 : 2.6)));
    for (const side of [-1, 1]) {
      k.box("wall-plate", [0, eave - 0.09, outside(side)], [length, 0.18, 0.06], "oak");
      k.box("sill-beam", [0, 0.36, outside(side)], [length, 0.14, 0.06], "oak");
      for (let i = 0; i <= bays; i++)
        k.box(
          "frame-stud",
          [-length / 2 + 0.09 + ((length - 0.18) * i) / bays, eave / 2, outside(side)],
          [0.16, eave, 0.06]
        );
      if (high) {
        k.beam(
          "wall-brace",
          [-length / 2 + 0.1, 0.45, outside(side)],
          [-length / 2 + 1.2, eave - 0.2, outside(side)],
          0.1
        );
        k.beam(
          "wall-brace",
          [length / 2 - 0.1, 0.45, outside(side)],
          [length / 2 - 1.2, eave - 0.2, outside(side)],
          0.1
        );
      }
    }
  } else if (look.frame === "logs" && high) {
    for (let y = 0.25; y < eave; y += 0.3)
      for (const side of [-1, 1]) {
        k.beam(
          "log-course",
          [-length / 2 - 0.25, y, outside(side)],
          [length / 2 + 0.25, y, outside(side)],
          0.1,
          "wood",
          true
        );
        k.beam(
          "log-course",
          [side * (length / 2 + 0.02), y + 0.15, -width / 2 - 0.25],
          [side * (length / 2 + 0.02), y + 0.15, width / 2 + 0.25],
          0.1,
          "wood",
          true
        );
      }
  }
}

/** A door on the +z (or -z) wall: boarded leaves, a dark opening behind them, iron straps on High. */
function door(k: ModelKit, x: number, z: number, wide: number, tall: number, high: boolean, face = 1) {
  k.box("doorway", [x, (tall + 0.06) / 2, z + face * 0.01], [wide + 0.12, tall + 0.06, 0.04], "dark");
  k.box("door-leaf", [x, tall / 2, z + face * 0.04], [wide, tall, 0.06], "wood");
  if (high)
    for (const y of [0.45, tall - 0.45])
      k.box("door-strap", [x, y, z + face * 0.08], [wide - 0.12, 0.06, 0.02], "iron");
}

/** A small unglazed opening with a board shutter propped beside it. */
function opening(k: ModelKit, x: number, z: number, y: number, high: boolean) {
  k.box("window-opening", [x, y, z + 0.01], [0.55, 0.5, 0.04], "dark");
  if (high) {
    k.box("window-shutter", [x + 0.45, y, z + 0.05], [0.3, 0.52, 0.04], "wood").rotation.y = 0.5;
    k.box("window-sill", [x, y - 0.28, z + 0.06], [0.65, 0.06, 0.1], "wood");
  }
}

function smoke(k: ModelKit, look: ProfileLook, x: number, roofTop: number, width: number) {
  if (look.smoke === "chimney") {
    k.box("chimney-stack", [x, (roofTop + 0.6) / 2, -width / 2 + 0.45], [0.7, roofTop + 0.6, 0.6], "stone");
    k.box("chimney-cap", [x, roofTop + 0.65, -width / 2 + 0.45], [0.85, 0.12, 0.75], "stone");
    return;
  }
  // A smoke louver: a small gabled hood on the ridge over the hearth.
  k.box("smoke-louver", [x, roofTop + 0.2, 0], [0.8, 0.4, 0.6], "wood");
  k.box("louver-cap", [x, roofTop + 0.45, 0], [1, 0.1, 0.8], look.roof === "thatch" ? "wood" : look.roof);
}

export function createOpusVillageHouse(spec: VillageHouseSpec, quality: "low" | "high") {
  const high = quality === "high",
    look = LOOKS[spec.profile],
    length = clamp(spec.length, VILLAGE_HOUSE_LIMITS.length),
    width = clamp(spec.width, VILLAGE_HOUSE_LIMITS.width),
    eave = EAVE_METERS[spec.kind],
    front = width / 2,
    // Variant 1 mirrors the plan: the dwelling end and its door swap sides.
    end = spec.variant === 1 ? -1 : 1,
    k = new ModelKit(`village-${spec.kind}`, look.colors);
  walls(k, look, length, width, eave);
  frame(k, look, length, width, eave, high);
  const { top } = roofAndGables(k, look, length, width, eave);
  if (spec.kind === "longhouse") {
    // Home at one end, byre at the other, the cross-passage between them with opposed doors (Herefordshire,
    // Dartmoor): the passage stands a third of the way from the byre end.
    const passage = end * (-length / 2 + length / 3);
    door(k, passage, front, 1, 1.8, high);
    door(k, passage, -front, 1, 1.8, high, -1);
    const home = (passage + end * (length / 2)) / 2;
    opening(k, home - 0.9, front, 1.3, high);
    if (length > 13) opening(k, home + 0.9, front, 1.3, high);
    smoke(k, look, home, top, width);
    // The byre: slit vents and, on High, the drain running out under its end wall.
    const byre = (passage - end * (length / 2)) / 2;
    for (const dx of [-0.8, 0.8]) k.box("byre-vent", [byre + dx, 1.5, front + 0.01], [0.12, 0.45, 0.04], "dark");
    if (high) {
      k.box("byre-drain", [-end * (length / 2 + 0.12), 0.03, 0], [0.3, 0.06, 0.3], "stone");
      k.box("passage-step", [passage, 0.04, front + 0.17], [1.2, 0.08, 0.3], "stone");
    }
  } else if (spec.kind === "cottage") {
    const doorX = end * Math.min(length / 4, length / 2 - 0.9);
    door(k, doorX, front, 0.9, 1.7, high);
    opening(k, -doorX * 0.6 - end * 0.3, front, 1.25, high);
    if (length > 6.5) opening(k, -end * (length / 2 - 0.9), front, 1.25, high);
    smoke(k, look, -end * length * 0.15, top, width);
    if (high) k.box("door-step", [doorX, 0.04, front + 0.17], [1.1, 0.08, 0.3], "stone");
  } else {
    // A threshing barn: wide opposed doors in the middle of its long sides, for the draught between them.
    const wide = Math.min(3, length - 2);
    door(k, 0, front, wide, Math.min(2.5, eave - 0.2), high);
    door(k, 0, -front, wide * 0.7, Math.min(2.2, eave - 0.3), high, -1);
    if (high)
      for (const x of [-length / 2 + 1, length / 2 - 1])
        k.box("barn-vent", [x, eave - 0.6, front + 0.01], [0.1, 0.5, 0.04], "dark");
  }
  return compactModel(k.finish(), { mergeEquivalentMaterials: true });
}

/** Definitions shared by every house of one spec and quality, so CE instances them. */
const definitions = new Map<string, BvDefinition>();
export function villageHouseDefinition(spec: VillageHouseSpec, quality: "low" | "high"): BvDefinition {
  const key = `village-house:${quality}:${villageHouseSpecKey(spec)}`;
  let definition = definitions.get(key);
  if (!definition) {
    definition = { id: key, cacheKey: key, create: () => createOpusVillageHouse(spec, quality) };
    definitions.set(key, definition);
  }
  return definition;
}
