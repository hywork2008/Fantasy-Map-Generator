/**
 * The Opus street houses CE fits to its plots and saves a front for (docs/plan/bv-workhome-facade-variation.md):
 * trade shop-houses (task 51) and guild houses (task 48). Free of three.js.
 */

import {
  isOpusGuildHouseExterior,
  type OpusGuildHouseExterior,
  opusGuildHouseEnvelope,
  opusGuildHouseModel
} from "./opusGuildHouseProfiles";
import {
  isOpusWorkhomeExterior,
  type OpusWorkhomeExterior,
  opusWorkhomeEnvelope,
  opusWorkhomeModel
} from "./opusWorkhomeProfiles";

export type StreetHouseExterior = OpusWorkhomeExterior | OpusGuildHouseExterior;
export type StreetHouseKind = "workhome" | "guild-house";

export function streetHouseKind(modelId: string): StreetHouseKind | undefined {
  return opusWorkhomeModel(modelId) ? "workhome" : opusGuildHouseModel(modelId) ? "guild-house" : undefined;
}

/** Whether a saved front belongs to this model: a shop-house's to a workhome, a guild house's to a guild house. */
export function isStreetHouseExterior(modelId: string, value: unknown): value is StreetHouseExterior {
  const kind = streetHouseKind(modelId);
  return kind === "workhome"
    ? isOpusWorkhomeExterior(value)
    : kind === "guild-house"
      ? isOpusGuildHouseExterior(value)
      : false;
}

/** A street house's envelope (width, depth): its fitted plot, or its preset's. */
export function streetHouseEnvelope(modelId: string, exterior?: StreetHouseExterior): readonly [number, number] {
  return streetHouseKind(modelId) === "guild-house"
    ? opusGuildHouseEnvelope(exterior as OpusGuildHouseExterior | undefined)
    : opusWorkhomeEnvelope(modelId, exterior as OpusWorkhomeExterior | undefined);
}
