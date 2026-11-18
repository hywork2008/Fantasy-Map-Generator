/**
 * Opus rear works: the workshop a craftsman kept behind his house, in the back of his burgage plot
 * (docs/plan/ce-town-trade-rear-works.md §5.2). The house at the plot's front is a shop-house (opusWorkhome);
 * this model is the shed and its yard only. Free of three.js so CE generators can lay plots and entrances.
 * Coordinates are metres, +Z toward the house (the plot's front), the envelope centred on the origin.
 */

import type { OpusWorkhomeCulture } from "./opusWorkhomeProfiles";

export const OPUS_REAR_TRADES = ["baking", "cutlery", "metalwares", "glazing", "chandlery"] as const;
export type OpusRearTrade = (typeof OPUS_REAR_TRADES)[number];

export interface OpusRearWorksSpec {
  trade: OpusRearTrade;
  culture: OpusWorkhomeCulture;
  /** The plot's width between its side lines: 3–8 m. */
  widthMeters: number;
  /** From the shed's back to the yard's edge toward the house: 5–10 m. */
  depthMeters: number;
  shade: 0 | 1 | 2;
  /** The shed's door and the trade's hearth at the left (false) or right (true), seen from the house. */
  mirror: boolean;
}

export const OPUS_REAR_WORKS_MIN_WIDTH = 3;
export const OPUS_REAR_WORKS_MAX_WIDTH = 8;
export const OPUS_REAR_WORKS_MIN_DEPTH = 5;
export const OPUS_REAR_WORKS_MAX_DEPTH = 10;
export const OPUS_REAR_WORKS_WIDTH_STEP = 0.25;
export const OPUS_REAR_WORKS_DEPTH_STEP = 0.5;
/** The envelope where no plot sets it, and the MV preset. */
export const OPUS_REAR_WORKS_PRESET_ENVELOPE = [6, 7] as const;

/** The shed's roof reaches past its walls by this much (TradeKit `pitchedRoof` with the shed's overhangs). */
const SIDE_MARGIN = 0.3;
const BACK_MARGIN = 0.45;
/** The shed's depth, wall to open front; the rest of the envelope is the working yard before it. */
const SHED_DEPTH = 4.2;
const MIN_YARD = 1.6;

export interface OpusRearWorksLayout {
  spec: OpusRearWorksSpec;
  /** The shed's walls: x0–x1 across the plot, z0 its back, z1 its open (or doored) front. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** The yard in front of the shed, toward the house: z1 to yard. */
  yard: number;
  eave: number;
  pitch: number;
  /** The side the hearth and the door keep, -1 left or 1 right. */
  side: -1 | 1;
  /** Way in from the yard, model metres (+Z faces the house). */
  entrance: { id: "main"; position: readonly [number, number, number]; clearWidth: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const grid = (v: number) => Math.round(v * 100) / 100;

export function normalizeOpusRearWorksSpec(spec: OpusRearWorksSpec): OpusRearWorksSpec {
  return {
    ...spec,
    widthMeters: grid(clamp(spec.widthMeters, OPUS_REAR_WORKS_MIN_WIDTH, OPUS_REAR_WORKS_MAX_WIDTH)),
    depthMeters: grid(clamp(spec.depthMeters, OPUS_REAR_WORKS_MIN_DEPTH, OPUS_REAR_WORKS_MAX_DEPTH))
  };
}

export function opusRearWorksSpecKey(spec: OpusRearWorksSpec): string {
  const s = normalizeOpusRearWorksSpec(spec);
  return ["rear-works", s.trade, s.culture, s.widthMeters, s.depthMeters, s.shade, s.mirror ? "r" : "l"].join("|");
}

/** The shed and its yard on the envelope: shared by the model and by CE placement. */
export function opusRearWorksLayout(input: OpusRearWorksSpec): OpusRearWorksLayout {
  const spec = normalizeOpusRearWorksSpec(input),
    half = spec.widthMeters / 2,
    back = -spec.depthMeters / 2,
    front = spec.depthMeters / 2,
    z0 = back + BACK_MARGIN,
    z1 = Math.min(z0 + SHED_DEPTH, front - MIN_YARD),
    side = spec.mirror ? 1 : -1;
  return {
    spec,
    x0: -half + SIDE_MARGIN,
    x1: half - SIDE_MARGIN,
    z0,
    z1,
    yard: front,
    eave: 2.5,
    pitch: 40,
    side,
    entrance: { id: "main", position: [grid(side * Math.max(0, half - 1.2)), 0, grid(front)], clearWidth: 1 }
  };
}

export function opusRearWorksPreset(
  trade: OpusRearTrade,
  overrides: Partial<OpusRearWorksSpec> = {}
): OpusRearWorksSpec {
  const [widthMeters, depthMeters] = OPUS_REAR_WORKS_PRESET_ENVELOPE;
  return { trade, culture: "atlantic", widthMeters, depthMeters, shade: 1, mirror: false, ...overrides };
}

/** What CE keeps per placed rear works: the culture and shade it was drawn in, and its plot-fitted envelope. */
export type OpusRearWorksExterior = Pick<OpusRearWorksSpec, "culture" | "shade"> &
  Partial<Pick<OpusRearWorksSpec, "widthMeters" | "depthMeters" | "mirror">>;

const MODEL_ID = /^trade-workshop\.rear-works\.([a-z]+)$/;

export const opusRearWorksModelId = (trade: OpusRearTrade) => `trade-workshop.rear-works.${trade}`;

export function opusRearWorksModel(modelId: string): { trade: OpusRearTrade } | undefined {
  const m = MODEL_ID.exec(modelId);
  return m && (OPUS_REAR_TRADES as readonly string[]).includes(m[1]) ? { trade: m[1] as OpusRearTrade } : undefined;
}

export function opusRearWorksSpecOf(modelId: string, exterior: OpusRearWorksExterior): OpusRearWorksSpec | undefined {
  const model = opusRearWorksModel(modelId);
  const given = Object.fromEntries(Object.entries(exterior).filter(([, v]) => v !== undefined));
  return model && opusRearWorksPreset(model.trade, given as Partial<OpusRearWorksSpec>);
}
