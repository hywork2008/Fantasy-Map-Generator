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

/**
 * A trade workhome's asset fitted to a run of burgage plots (docs/plan/bv-workhome-facade-variation.md §4.7, W4): its
 * frontage the run's on a 0.25 m grid, its depth its Codex form's (on a 0.5 m grid) or what the plots leave, its
 * door on the given side. Undefined for any other asset, or where a 3 m shop-house or an 8 m deep one does not fit.
 */
export function fittedWorkhomeAsset(
  asset: LandmarkAsset,
  frontage: number,
  plotDepth: number,
  mirror: boolean
): { asset: LandmarkAsset; fit: WorkhomeFit } | undefined {
  const model = asset.bvModel && opusWorkhomeModel(asset.bvModel.id);
  if (!model) return;
  const step = (v: number, s: number) => Math.floor(v / s + 1e-9) * s;
  const width = Math.min(MAX_FITTED_WIDTH, step(frontage - 2 * SIDE_MARGIN, OPUS_WORKHOME_WIDTH_STEP)),
    depth = Math.min(
      step(OPUS_WORKHOME_PRESET_ENVELOPES[model.form][1], OPUS_WORKHOME_DEPTH_STEP),
      step(plotDepth - DEPTH_MARGIN, OPUS_WORKHOME_DEPTH_STEP)
    );
  if (width < OPUS_WORKHOME_MIN_WIDTH || depth < MIN_DEPTH) return;
  const door = opusWorkhomeLayout(
      opusWorkhomePreset(model.role, model.form, { widthMeters: width, depthMeters: depth, mirror })
    ).entrance,
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
