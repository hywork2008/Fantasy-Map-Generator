import type { BuildingAppearanceProfile } from "../appearance/types";
import type { Author } from "../authors";
import type { Surface } from "./modelKit";

/** Kinds, regions, sizes and looks shared by the Low and High village houses (roadside village plan §14). */
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
  /** `gable`: the door in the +x gable end, the street side of a house standing end on to it on a narrow plot (a
   * house deeper than its frontage). The eaves side (+z) otherwise. Not for a barn, whose doors open on its yard. */
  entrance?: "eave" | "gable";
}

/** The plan's sizes (§14.2): Hangleton 12 × 6 m longhouses and buildings under 9 m, Herefordshire 5 × 3.5 m cots. */
export const VILLAGE_HOUSE_PRESETS: Record<VillageHouseKind, { length: number; width: number }> = {
  longhouse: { length: 14, width: 5.5 },
  cottage: { length: 7, width: 4.2 },
  barn: { length: 8, width: 4.5 }
};
/** Sizes a spec may take: the plan's ranges with room for the fitted footprint's rounding. */
export const VILLAGE_HOUSE_LIMITS = {
  length: [3, 20],
  width: [3, 6.5]
} as const;

export interface ProfileLook {
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
export const VILLAGE_HOUSE_LOOKS: Record<VillageHouseProfile, ProfileLook> = {
  atlantic: {
    wall: "plaster",
    frame: "box",
    roof: "thatch",
    pitchDeg: 50,
    wallMeters: 0.3,
    smoke: "louver"
  },
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
export const VILLAGE_EAVE_METERS: Record<VillageHouseKind, number> = {
  longhouse: 2.1,
  cottage: 2,
  barn: 2.8
};
export const VILLAGE_OVERHANG_METERS = 0.35;
export const VILLAGE_THATCH_METERS = 0.35;

export const clampTo = (v: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, v));

export function villageHouseSpecKey(spec: VillageHouseSpec): string {
  return [
    spec.kind,
    spec.profile,
    spec.length.toFixed(2),
    spec.width.toFixed(2),
    spec.variant,
    spec.entrance === "gable" ? "gable" : "eave"
  ].join("|");
}

/**
 * Where the openings, hearth and byre of a house stand, shared by both qualities so High details the plan Low draws.
 * x along the long side, +z the front; `face` is the wall the opening is in.
 */
export interface VillageOpening {
  face: "front" | "back" | "right" | "left";
  /** Along the wall: x on the front and back, z on the ends. */
  at: number;
  base: number;
  width: number;
  height: number;
  kind: "door" | "window" | "slit";
}
export interface VillageLayout {
  openings: VillageOpening[];
  /** The hearth's x, under the louver or beside the chimney stack; none in a barn. */
  smokeX?: number;
  /** The byre's centre x in a longhouse, and the end its drain runs out of (+1 or -1). */
  byre?: { x: number; end: 1 | -1 };
  /** The home end's centre x, where the bench and woodpile stand. */
  homeX?: number;
}

export function villageHouseLayout(spec: VillageHouseSpec, length: number, width: number): VillageLayout {
  const eave = VILLAGE_EAVE_METERS[spec.kind],
    end = spec.variant === 1 ? -1 : 1,
    openings: VillageOpening[] = [],
    door = (face: VillageOpening["face"], at: number, w: number, h: number) =>
      openings.push({ face, at, base: 0, width: w, height: h, kind: "door" }),
    window = (face: VillageOpening["face"], at: number, centre: number) =>
      openings.push({
        face,
        at,
        base: centre - 0.25,
        width: 0.55,
        height: 0.5,
        kind: "window"
      }),
    slit = (face: VillageOpening["face"], at: number) =>
      openings.push({
        face,
        at,
        base: 1.275,
        width: 0.12,
        height: 0.45,
        kind: "slit"
      });
  if (spec.entrance === "gable" && spec.kind !== "barn") {
    // End on to the street: the door and a window in the street gable, the home at that end, the hearth behind it.
    const endWall = length / 2,
      doorZ = end * Math.min(width / 4, width / 2 - 0.9),
      longhouse = spec.kind === "longhouse";
    door("right", doorZ, longhouse ? 1 : 0.9, longhouse ? 1.8 : 1.7);
    if (width > 4) window("right", -doorZ * 0.8, 1.3);
    window("front", endWall - Math.min(2.5, length / 3), 1.3);
    const layout: VillageLayout = {
      openings,
      smokeX: endWall - Math.min(3, length / 3),
      homeX: endWall - Math.min(2, length / 4)
    };
    if (longhouse) {
      const byre = -endWall + length / 4;
      for (const dx of [-0.8, 0.8]) slit("front", byre + dx);
      door("back", byre, 1.2, 1.8);
      layout.byre = { x: byre, end: -1 };
    }
    return layout;
  }
  if (spec.kind === "longhouse") {
    // Home at one end, byre at the other, the cross-passage between them with opposed doors (Herefordshire,
    // Dartmoor): the passage stands a third of the way from the byre end.
    const passage = end * (-length / 2 + length / 3),
      home = (passage + end * (length / 2)) / 2,
      byre = (passage - end * (length / 2)) / 2;
    door("front", passage, 1, 1.8);
    door("back", passage, 1, 1.8);
    window("front", home - 0.9, 1.3);
    if (length > 13) window("front", home + 0.9, 1.3);
    for (const dx of [-0.8, 0.8]) slit("front", byre + dx);
    return {
      openings,
      smokeX: home,
      homeX: home,
      byre: { x: byre, end: -end as 1 | -1 }
    };
  }
  if (spec.kind === "cottage") {
    const doorX = end * Math.min(length / 4, length / 2 - 0.9);
    door("front", doorX, 0.9, 1.7);
    window("front", -doorX * 0.6 - end * 0.3, 1.25);
    if (length > 6.5) window("front", -end * (length / 2 - 0.9), 1.25);
    return {
      openings,
      smokeX: -end * length * 0.15,
      homeX: -end * length * 0.2
    };
  }
  // A threshing barn: wide opposed doors in the middle of its long sides, for the draught between them.
  const wide = Math.min(3, length - 2);
  door("front", 0, wide, Math.min(2.5, eave - 0.2));
  door("back", 0, wide * 0.7, Math.min(2.2, eave - 0.3));
  for (const x of [-length / 2 + 1, length / 2 - 1])
    openings.push({
      face: "front",
      at: x,
      base: eave - 0.85,
      width: 0.1,
      height: 0.5,
      kind: "slit"
    });
  return { openings };
}
