/**
 * Opus shop-house workhome: the street front of a craftsman's house, with no interior ledger
 * (docs/plan/bv-workhome-facade-variation.md §4). Free of three.js so CE generators can lay plots and entrances.
 * Coordinates are metres, +Z toward the street, the envelope centred on the origin.
 */
import type { BuildingPaletteId } from "../appearance/palette";
import type { BuildingAppearanceProfile } from "../appearance/types";
import { REGIONAL_HOUSE_STYLES } from "../houses/regionalHouseStyles";
import type { WorkhomeForm } from "./workhomeFormProfiles";
import type { WorkhomeRole } from "./workhomeTradeProfiles";

export type OpusWorkhomeCulture = Exclude<BuildingAppearanceProfile, "legacy">;

export const OPUS_WORKHOME_CULTURES: readonly OpusWorkhomeCulture[] = [
  "atlantic",
  "northern-urban",
  "mediterranean",
  "stone-upland",
  "northern-wooded"
];

export interface OpusWorkhomeSpec {
  role: WorkhomeRole;
  culture: OpusWorkhomeCulture;
  /** Plot frontage, the envelope's X extent: 3.0–7.7 m on a 0.01 m grid. */
  widthMeters: number;
  /** Envelope depth along Z: 8–12 m (CE presets keep the Codex 8.93 and 10.53 m envelopes). */
  depthMeters: number;
  /** Ground storey plus upper storeys; the garret under the roof is not counted. */
  storeys: 2 | 3;
  /** Gable or eaves to the street. The footprint and the door never turn, only the ridge. */
  entranceFace: "gable" | "eave";
  /** One shop window beside the door, or a door between two (Treswell's Cheapside, plan §4.3); needs 6 m. */
  fronts: 1 | 2;
  shop: "open" | "closed";
  door: "closed" | "ajar";
  sign: "board" | "none";
  shade: 0 | 1 | 2;
  /** Door on the left (false) or the right (true), seen from the street. */
  mirror: boolean;
}

/** Narrowest frontage: a shop window and a door side by side (Bennell p.193; Poultry p.56). */
export const OPUS_WORKHOME_MIN_WIDTH = 3;
export const OPUS_WORKHOME_MAX_WIDTH = 7.7;
/** Double fronts need a window either side of the door (Bennell p.194: 6.1–7.32 m). */
export const OPUS_WORKHOME_DOUBLE_FRONT_WIDTH = 6;

/** Street-side reach in front of the ground-storey wall: stall board, propped shutter, sign. */
const STREET_REACH = 0.8;
/** Eave overhang past the wall, and the verge of a gable on the party wall (a terrace has none to speak of). */
const EAVE = 0.12;
const VERGE = 0.05;
/** A framed back gable and its window sills stand proud of the wall by this much (TradeKit). */
const GABLE_FRAME = 0.14;
const DOOR_WIDTH = 0.9;
/** Wall left between openings and at the corners. */
const POST = 0.2;
/** The narrowest shop window worth the name; a gable front that leaves less turns its eaves to the street. */
const MIN_SHOP = 1;
const GROUND = 3.0;
const UPPER = 2.7;

interface CultureFront {
  /** Shop openings under round arches with a stone counter sill (the Midi's maison polyvalente). */
  arched: boolean;
  /** Ground storey in stone under the upper storeys' finish. */
  stoneGround: boolean;
  /** Fixed street face; undefined follows the spec. */
  face?: "gable" | "eave";
  pitch: number;
  /** Loft door with a hoist beam in the street gable (Hanseatic warehouse lofts). */
  hoist: boolean;
}

/** Ground-storey types by culture (plan §4.3; Garrigou Grandchamp 2002 p.94, Reinle RDK VII). */
export const OPUS_WORKHOME_FRONTS: Record<OpusWorkhomeCulture, CultureFront> = {
  atlantic: { arched: false, stoneGround: false, pitch: 50, hoist: false },
  "northern-urban": { arched: false, stoneGround: false, face: "gable", pitch: 55, hoist: true },
  mediterranean: { arched: true, stoneGround: true, face: "eave", pitch: 22, hoist: false },
  "stone-upland": { arched: true, stoneGround: true, pitch: 35, hoist: false },
  "northern-wooded": { arched: false, stoneGround: false, pitch: 45, hoist: false }
};

export interface OpusWorkhomeOpening {
  a: number;
  b: number;
}

export interface OpusWorkhomeLayout {
  spec: OpusWorkhomeSpec;
  /** Ground-storey walls; z1 is the street front, z0 the back. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  ground: number;
  upper: number;
  jetty: number;
  ridge: "x" | "z";
  pitch: number;
  /** Roof slab thickness and eave overhang the model must use to stay inside the envelope. */
  roofThickness: number;
  eaveOverhang: number;
  vergeOverhang: number;
  door: OpusWorkhomeOpening;
  shops: OpusWorkhomeOpening[];
  /** Upper-storey window centres along X. */
  windows: number[];
  arched: boolean;
  stoneGround: boolean;
  hoist: boolean;
  /** Main entrance on the street front, model metres. */
  entrance: { id: "main"; position: readonly [number, number, number]; clearWidth: number };
  colors: { wall: BuildingPaletteId; roof: BuildingPaletteId; frame?: BuildingPaletteId; plinth: BuildingPaletteId };
  finish: "frame" | "boarding" | "masonry";
  cover: (typeof REGIONAL_HOUSE_STYLES)[OpusWorkhomeCulture]["cover"];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const grid = (v: number) => Math.round(v * 100) / 100;

/** The spec on its grids and inside its ranges, so equal keys mean equal models. */
export function normalizeOpusWorkhomeSpec(spec: OpusWorkhomeSpec): OpusWorkhomeSpec {
  const widthMeters = grid(clamp(spec.widthMeters, OPUS_WORKHOME_MIN_WIDTH, OPUS_WORKHOME_MAX_WIDTH));
  const face = OPUS_WORKHOME_FRONTS[spec.culture].face ?? spec.entranceFace;
  return {
    ...spec,
    widthMeters,
    depthMeters: grid(clamp(spec.depthMeters, 8, 12)),
    entranceFace: face,
    fronts: spec.fronts === 2 && widthMeters >= OPUS_WORKHOME_DOUBLE_FRONT_WIDTH ? 2 : 1
  };
}

export function opusWorkhomeSpecKey(spec: OpusWorkhomeSpec): string {
  const s = normalizeOpusWorkhomeSpec(spec);
  return [
    s.role,
    s.culture,
    s.widthMeters,
    s.depthMeters,
    s.storeys,
    s.entranceFace,
    s.fronts,
    s.shop,
    s.door,
    s.sign,
    s.shade,
    s.mirror ? "r" : "l"
  ].join("|");
}

/** Walls, openings and the entrance of a spec: shared by the model and by CE placement. */
export function opusWorkhomeLayout(input: OpusWorkhomeSpec): OpusWorkhomeLayout {
  const first = layoutFor(normalizeOpusWorkhomeSpec(input));
  // A gable front's eaves eat into a narrow plot; where they leave no shop the house turns its eaves to the street.
  if (
    first.spec.entranceFace === "gable" &&
    !OPUS_WORKHOME_FRONTS[first.spec.culture].face &&
    first.shops.some(o => o.b - o.a < MIN_SHOP)
  )
    return layoutFor({ ...first.spec, entranceFace: "eave" });
  return first;
}

function layoutFor(spec: OpusWorkhomeSpec): OpusWorkhomeLayout {
  const style = REGIONAL_HOUSE_STYLES[spec.culture],
    front = OPUS_WORKHOME_FRONTS[spec.culture],
    ridge = spec.entranceFace === "gable" ? "z" : "x",
    roofThickness = style.cover === "thatch" ? 0.3 : 0.14,
    pitch = (front.pitch * Math.PI) / 180;
  // The roof slab's outer corner reaches past its eave line by its end allowance and its thickness (TradeKit).
  const eaveReach = EAVE + 0.3 * roofThickness * Math.cos(pitch) + roofThickness * Math.sin(pitch) + 0.01;
  const side = ridge === "x" ? VERGE : eaveReach,
    backMargin = ridge === "x" ? eaveReach : GABLE_FRAME;
  const half = spec.widthMeters / 2,
    x0 = -half + side,
    x1 = half - side,
    z0 = -spec.depthMeters / 2 + backMargin,
    jetty = Math.min(style.jetty, 0.4),
    // The stall board and the sign reach into the street; an eaves front also must keep its eave on the plot.
    z1 = spec.depthMeters / 2 - Math.max(STREET_REACH, jetty + (ridge === "x" ? eaveReach : VERGE)),
    inner = x1 - x0;
  // The door stands at one side (or the middle of a double front); the shop fills the rest.
  const left = !spec.mirror;
  let door: OpusWorkhomeOpening, shops: OpusWorkhomeOpening[];
  if (spec.fronts === 2) {
    door = { a: -DOOR_WIDTH / 2, b: DOOR_WIDTH / 2 };
    const span = Math.min(2.2, (inner - DOOR_WIDTH) / 2 - 2 * POST);
    shops = [
      { a: door.a - POST - span, b: door.a - POST },
      { a: door.b + POST, b: door.b + POST + span }
    ];
  } else {
    door = left ? { a: x0 + POST, b: x0 + POST + DOOR_WIDTH } : { a: x1 - POST - DOOR_WIDTH, b: x1 - POST };
    const from = left ? door.b + POST : x0 + POST,
      to = left ? x1 - POST : door.a - POST,
      span = Math.min(front.arched ? 2.2 : 2.6, to - from),
      c = (from + to) / 2;
    shops = [{ a: c - span / 2, b: c + span / 2 }];
  }
  const bays = clamp(Math.round(inner / 1.6), 1, 4),
    windows = Array.from({ length: bays }, (_, i) => grid(x0 + ((i + 0.5) * inner) / bays));
  return {
    spec,
    x0,
    x1,
    z0,
    z1,
    ground: GROUND,
    upper: UPPER,
    jetty,
    ridge,
    pitch: front.pitch,
    roofThickness,
    eaveOverhang: EAVE,
    vergeOverhang: VERGE,
    door,
    shops,
    windows,
    arched: front.arched,
    stoneGround: front.stoneGround,
    hoist: front.hoist && ridge === "z",
    entrance: { id: "main", position: [grid((door.a + door.b) / 2), 0, grid(z1)], clearWidth: DOOR_WIDTH },
    colors: { wall: style.wall, roof: style.roof, frame: style.frame, plinth: style.plinth },
    finish: style.boarding ? "boarding" : style.frame ? "frame" : "masonry",
    cover: style.cover
  };
}

/** Codex envelopes the CE presets keep, so compact placement is unchanged (plan §4.7). */
export const OPUS_WORKHOME_PRESET_ENVELOPES: Record<WorkhomeForm, readonly [number, number]> = {
  standard: [6.44, 10.53],
  narrow: [5.24, 8.93],
  wide: [7.64, 10.53]
};

/** The catalogue's preset of a trade and Codex form: an English shop-house of the form's envelope. */
export function opusWorkhomePreset(
  role: WorkhomeRole,
  form: WorkhomeForm,
  overrides: Partial<OpusWorkhomeSpec> = {}
): OpusWorkhomeSpec {
  const [widthMeters, depthMeters] = OPUS_WORKHOME_PRESET_ENVELOPES[form];
  return {
    role,
    culture: "atlantic",
    widthMeters,
    depthMeters,
    storeys: form === "narrow" ? 3 : 2,
    entranceFace: "eave",
    fronts: 1,
    shop: "open",
    door: "closed",
    sign: "board",
    shade: 1,
    mirror: false,
    ...overrides
  };
}
