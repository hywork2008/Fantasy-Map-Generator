/**
 * Opus guild house: a town house in the street row that a guild bought for its Stube (docs/plan/
 * bv-workhome-facade-variation.md §5.6, §6.1 W5b), as Zürich's and Konstanz's guilds did. Built on the shop-house's
 * shell; free of three.js so CE generators can lay plots and entrances. +Z toward the street, centred on the origin.
 */

import type { EnclosedGuildRole } from "./enclosedGuildTrades";
import {
  OPUS_WORKHOME_CULTURES,
  OPUS_WORKHOME_FRONTS,
  type OpusStreetHouseSpec,
  type OpusStreetLayout,
  type OpusWorkhomeOpening,
  opusStreetShell,
  opusStreetWindows
} from "./opusWorkhomeProfiles";

export interface OpusGuildHouseSpec extends OpusStreetHouseSpec {
  /** The guild drawn on the sign: the first of the guilds meeting in the house. */
  role: EnclosedGuildRole;
  door: "closed" | "ajar";
}

/** One house plot at the narrowest, two of a dense row at the widest (Rosgarten, Konstanz, was one town house). */
export const OPUS_GUILD_HOUSE_MIN_WIDTH = 6;
export const OPUS_GUILD_HOUSE_MAX_WIDTH = 10;
export const OPUS_GUILD_HOUSE_MIN_DEPTH = 9;
export const OPUS_GUILD_HOUSE_MAX_DEPTH = 14;
/** The envelope where no plot sets it (compact lots), and the MV preset (provisional, plan §5.6). */
export const OPUS_GUILD_HOUSE_PRESET_ENVELOPE = [8, 12] as const;

/** The guild's room over the ground storey is taller than a house's chamber; above it the house's own height. */
const STUBE = 3.2;
const PORTAL_WIDTH = 1.2;
const POST = 0.4;
/** The Stube's row of close-set windows (Reihenfenster): pane width and spacing, kept off the corners. */
const STUBE_PANE = 0.62;
const STUBE_PITCH = 0.78;
const STUBE_CORNER = 0.45;

export interface OpusGuildHouseLayout extends OpusStreetLayout {
  spec: OpusGuildHouseSpec;
  /** Barred ground-storey windows beside the portal. */
  groundWindows: number[];
  /** Window centres of the Stube's row. */
  stubeWindows: number[];
  /** Storey heights above the ground storey: the Stube, then the house's upper storeys. */
  heights: number[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const grid = (v: number) => Math.round(v * 100) / 100;

export function normalizeOpusGuildHouseSpec(spec: OpusGuildHouseSpec): OpusGuildHouseSpec {
  return {
    ...spec,
    widthMeters: grid(clamp(spec.widthMeters, OPUS_GUILD_HOUSE_MIN_WIDTH, OPUS_GUILD_HOUSE_MAX_WIDTH)),
    depthMeters: grid(clamp(spec.depthMeters, OPUS_GUILD_HOUSE_MIN_DEPTH, OPUS_GUILD_HOUSE_MAX_DEPTH)),
    entranceFace: OPUS_WORKHOME_FRONTS[spec.culture].face ?? spec.entranceFace,
    storeys: spec.storeys === 2 ? 2 : 3
  };
}

export function opusGuildHouseSpecKey(spec: OpusGuildHouseSpec): string {
  const s = normalizeOpusGuildHouseSpec(spec);
  return [
    "guild-house",
    s.role,
    s.culture,
    s.widthMeters,
    s.depthMeters,
    s.storeys,
    s.entranceFace,
    s.door,
    s.shade,
    s.mirror ? "r" : "l"
  ].join("|");
}

/** Walls, openings and the entrance of a guild house: shared by the model and by CE placement. */
export function opusGuildHouseLayout(input: OpusGuildHouseSpec): OpusGuildHouseLayout {
  const spec = normalizeOpusGuildHouseSpec(input),
    shell = opusStreetShell(spec),
    { x0, x1, z1 } = shell;
  // The portal at one side; barred windows light the ground-storey hall beside it.
  const door: OpusWorkhomeOpening = spec.mirror
    ? { a: x1 - POST - PORTAL_WIDTH, b: x1 - POST }
    : { a: x0 + POST, b: x0 + POST + PORTAL_WIDTH };
  const from = spec.mirror ? x0 + POST : door.b + POST,
    to = spec.mirror ? door.a - POST : x1 - POST,
    count = Math.max(1, Math.min(3, Math.floor((to - from) / 1.5)));
  const groundWindows = Array.from({ length: count }, (_, i) => grid(from + ((i + 0.5) * (to - from)) / count));
  const span = x1 - x0 - 2 * STUBE_CORNER,
    panes = clamp(Math.floor((span + STUBE_PITCH - STUBE_PANE) / STUBE_PITCH), 3, 9),
    c = (x0 + x1) / 2;
  const stubeWindows = Array.from({ length: panes }, (_, i) => grid(c + (i - (panes - 1) / 2) * STUBE_PITCH));
  return {
    ...shell,
    // A guild house's ground storey is stone (Haus zum Rüden, Zürich, rebuilt in stone in 1348), save in timber lands.
    stoneGround: spec.culture !== "northern-wooded",
    spec,
    door,
    windows: opusStreetWindows(shell),
    hoist: false,
    entrance: { id: "main", position: [grid((door.a + door.b) / 2), 0, grid(z1)], clearWidth: PORTAL_WIDTH },
    groundWindows,
    stubeWindows,
    heights: [STUBE, ...(spec.storeys === 3 ? [shell.upper] : [])]
  };
}

export const OPUS_GUILD_HOUSE_STUBE = { pane: STUBE_PANE, height: 1.15, sill: 0.95 } as const;

/** The MV preset of a guild: a Hanseatic gable-fronted house on the preset envelope. */
export function opusGuildHousePreset(
  role: EnclosedGuildRole,
  overrides: Partial<OpusGuildHouseSpec> = {}
): OpusGuildHouseSpec {
  const [widthMeters, depthMeters] = OPUS_GUILD_HOUSE_PRESET_ENVELOPE;
  return {
    role,
    culture: "northern-urban",
    widthMeters,
    depthMeters,
    storeys: 3,
    entranceFace: "gable",
    door: "closed",
    shade: 1,
    mirror: false,
    ...overrides
  };
}

/** What CE keeps per placed guild house: its front, and its plot-fitted envelope and portal side. */
export type OpusGuildHouseExterior = Pick<
  OpusGuildHouseSpec,
  "culture" | "entranceFace" | "storeys" | "door" | "shade"
> &
  Partial<Pick<OpusGuildHouseSpec, "widthMeters" | "depthMeters" | "mirror">>;

export const OPUS_GUILD_HOUSE_WIDTH_STEP = 0.25;
export const OPUS_GUILD_HOUSE_DEPTH_STEP = 0.5;

const MODEL_ID = /^trade-hall\.guild-house\.([a-z-]+)$/;

export const opusGuildHouseModelId = (role: EnclosedGuildRole) => `trade-hall.guild-house.${role}`;

/** The guild of a guild-house model id, or undefined for any other model. */
export function opusGuildHouseModel(modelId: string): { role: EnclosedGuildRole } | undefined {
  const m = MODEL_ID.exec(modelId);
  return m ? { role: m[1] as EnclosedGuildRole } : undefined;
}

export function opusGuildHouseSpecOf(
  modelId: string,
  exterior: OpusGuildHouseExterior
): OpusGuildHouseSpec | undefined {
  const model = opusGuildHouseModel(modelId);
  const given = Object.fromEntries(Object.entries(exterior).filter(([, v]) => v !== undefined));
  return model && opusGuildHousePreset(model.role, given as Partial<OpusGuildHouseSpec>);
}

export function opusGuildHouseEnvelope(exterior?: Partial<OpusGuildHouseExterior>): readonly [number, number] {
  const [w, d] = OPUS_GUILD_HOUSE_PRESET_ENVELOPE;
  return [exterior?.widthMeters ?? w, exterior?.depthMeters ?? d];
}

const onGrid = (v: unknown, step: number, lo: number, hi: number) =>
  typeof v === "number" && v >= lo && v <= hi && Math.abs(v / step - Math.round(v / step)) < 1e-9;

export function isOpusGuildHouseExterior(value: unknown): value is OpusGuildHouseExterior {
  const v = value as Record<string, unknown>;
  return (
    !!v &&
    typeof v === "object" &&
    Object.keys(v).every(k =>
      ["culture", "entranceFace", "storeys", "door", "shade", "widthMeters", "depthMeters", "mirror"].includes(k)
    ) &&
    (v.widthMeters === undefined ||
      onGrid(v.widthMeters, OPUS_GUILD_HOUSE_WIDTH_STEP, OPUS_GUILD_HOUSE_MIN_WIDTH, OPUS_GUILD_HOUSE_MAX_WIDTH)) &&
    (v.depthMeters === undefined ||
      onGrid(v.depthMeters, OPUS_GUILD_HOUSE_DEPTH_STEP, OPUS_GUILD_HOUSE_MIN_DEPTH, OPUS_GUILD_HOUSE_MAX_DEPTH)) &&
    (v.mirror === undefined || typeof v.mirror === "boolean") &&
    (OPUS_WORKHOME_CULTURES as readonly unknown[]).includes(v.culture) &&
    (v.entranceFace === "gable" || v.entranceFace === "eave") &&
    (v.storeys === 2 || v.storeys === 3) &&
    (v.door === "closed" || v.door === "ajar") &&
    (v.shade === 0 || v.shade === 1 || v.shade === 2)
  );
}
