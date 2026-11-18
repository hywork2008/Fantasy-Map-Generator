import {
  OPUS_GUILD_HOUSE_DEPTH_STEP,
  OPUS_GUILD_HOUSE_MAX_WIDTH,
  OPUS_GUILD_HOUSE_MIN_DEPTH,
  OPUS_GUILD_HOUSE_MIN_WIDTH,
  OPUS_GUILD_HOUSE_PRESET_ENVELOPE,
  OPUS_GUILD_HOUSE_WIDTH_STEP,
  opusGuildHouseLayout,
  opusGuildHouseModel,
  opusGuildHousePreset
} from "../../../../buildings/medieval/opusGuildHouseProfiles";
import {
  OPUS_WORKHOME_DEPTH_STEP,
  OPUS_WORKHOME_MIN_WIDTH,
  OPUS_WORKHOME_PRESET_ENVELOPES,
  OPUS_WORKHOME_WIDTH_STEP,
  type OpusWorkhomeExterior,
  opusWorkhomeLayout,
  opusWorkhomeModel,
  opusWorkhomePreset
} from "../../../../buildings/medieval/opusWorkhomeProfiles";
import type { LandmarkAsset, Point } from "../../../types/document";

/** Widest plot-fitted workhome on the width grid (the model takes 7.7 m, its grid stops at 7.5). */
const MAX_FITTED_WIDTH = 7.5;
/** Left between the building and its plot's side lines. */
const SIDE_MARGIN = 0.1;
/** Left behind the building to the plot's shallowest point, past the front setback. */
const DEPTH_MARGIN = 0.2;
const MIN_DEPTH = 8;

export type WorkhomeFit = Required<Pick<OpusWorkhomeExterior, "widthMeters" | "depthMeters" | "mirror">>;

/** The sizes a street house is fitted on: its frontage and depth ranges and grids, its preset depth. */
function fitting(asset: LandmarkAsset) {
  const id = asset.bvModel?.id ?? "",
    workhome = opusWorkhomeModel(id);
  if (workhome)
    return {
      minWidth: OPUS_WORKHOME_MIN_WIDTH,
      maxWidth: MAX_FITTED_WIDTH,
      widthStep: OPUS_WORKHOME_WIDTH_STEP,
      minDepth: MIN_DEPTH,
      presetDepth: OPUS_WORKHOME_PRESET_ENVELOPES[workhome.form][1],
      depthStep: OPUS_WORKHOME_DEPTH_STEP,
      door: (fit: WorkhomeFit) => opusWorkhomeLayout(opusWorkhomePreset(workhome.role, workhome.form, fit)).entrance
    };
  const guild = opusGuildHouseModel(id);
  if (guild)
    return {
      minWidth: OPUS_GUILD_HOUSE_MIN_WIDTH,
      maxWidth: OPUS_GUILD_HOUSE_MAX_WIDTH,
      widthStep: OPUS_GUILD_HOUSE_WIDTH_STEP,
      minDepth: OPUS_GUILD_HOUSE_MIN_DEPTH,
      presetDepth: OPUS_GUILD_HOUSE_PRESET_ENVELOPE[1],
      depthStep: OPUS_GUILD_HOUSE_DEPTH_STEP,
      door: (fit: WorkhomeFit) => opusGuildHouseLayout(opusGuildHousePreset(guild.role, fit)).entrance
    };
}

/**
 * A street house's asset fitted to a run of burgage plots (docs/plan/bv-workhome-facade-variation.md §4.7, W4, W5b):
 * its frontage the run's on its grid, its depth its preset's (on its grid) or what the plots leave, its door on the
 * given side. A trade workhome takes 3–7.5 m, a guild house 6–10 m. Undefined for any other asset, or where the
 * house does not fit.
 */
export function fittedWorkhomeAsset(
  asset: LandmarkAsset,
  frontage: number,
  plotDepth: number,
  mirror: boolean
): { asset: LandmarkAsset; fit: WorkhomeFit } | undefined {
  const f = fitting(asset);
  if (!f) return;
  const step = (v: number, s: number) => Math.floor(v / s + 1e-9) * s;
  const width = Math.min(f.maxWidth, step(frontage - 2 * SIDE_MARGIN, f.widthStep)),
    depth = Math.min(step(f.presetDepth, f.depthStep), step(plotDepth - DEPTH_MARGIN, f.depthStep));
  if (width < f.minWidth || depth < f.minDepth) return;
  const door = f.door({ widthMeters: width, depthMeters: depth, mirror }),
    outer: Point[] = [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
      [-width / 2, depth / 2]
    ];
  return {
    fit: { widthMeters: width, depthMeters: depth, mirror },
    asset: {
      ...asset,
      id: `${asset.id}:w${width}:d${depth}:${mirror ? "r" : "l"}`,
      referenceSizeMeters: [width, depth],
      footprint: [{ outer, holes: [] }],
      minimumSite: [{ outer, holes: [] }],
      // As bvFacilityAsset turns model metres into plan metres: +Z the street is -Y on the plan.
      entrances: [
        {
          id: door.id,
          point: [door.position[0], -door.position[2]],
          outward: [0, -1],
          widthMeters: door.clearWidth,
          required: true
        }
      ],
      renderSvg: `<svg xmlns="http://www.w3.org/2000/svg"><rect x="${-width / 2}" y="${-depth / 2}" width="${width}" height="${depth}" fill="#d8bd86" stroke="#735e36"/></svg>`
    }
  };
}
