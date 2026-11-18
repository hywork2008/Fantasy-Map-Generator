import {
  OPUS_REAR_WORKS_DEPTH_STEP,
  OPUS_REAR_WORKS_MAX_WIDTH,
  OPUS_REAR_WORKS_MIN_DEPTH,
  OPUS_REAR_WORKS_MIN_WIDTH,
  OPUS_REAR_WORKS_PRESET_ENVELOPE,
  OPUS_REAR_WORKS_WIDTH_STEP,
  type OpusRearTrade,
  type OpusRearWorksExterior,
  opusRearWorksLayout,
  opusRearWorksModelId,
  opusRearWorksPreset
} from "../../../../buildings/medieval/opusRearWorksProfiles";
import {
  opusShopHouseModelId,
  opusWorkhomeLayout,
  opusWorkhomePreset
} from "../../../../buildings/medieval/opusWorkhomeProfiles";
import type { LandmarkAsset } from "../../../types/document";
import type { VectorPlacement } from "../../../types/vector/document";
import { bvFacilityAsset } from "../../bvFacilityAsset";

/**
 * The town trades a burgage plot takes as a shop-house at its front and works behind it
 * (docs/plan/ce-town-trade-rear-works.md §5.1, R2), by the dedicated workshop that stands for them where there are no
 * plots (`compact`).
 */
const PAIRED_TRADES: Readonly<Record<string, OpusRearTrade>> = {
  "trade-workshop.dedicated-bakehouse": "baking",
  "trade-workshop.dedicated-cutlery": "cutlery",
  "trade-workshop.dedicated-metalwares": "metalwares",
  "trade-workshop.dedicated-glaziers-workshop": "glazing",
  "trade-workshop.dedicated-chandlery": "chandlery",
  // Market trades (R3): their shops stand in the rows facing the market place.
  "trade-workshop.dedicated-fishmongery": "fishmongery",
  "trade-workshop.dedicated-butchery": "butchery"
};

/** Open yard between the shop-house's back wall and the rear works (plan §5.3). */
export const REAR_YARD_METERS = 4;
/** Left between the rear works and its plot's side lines, and behind it to the plot's back. */
const SIDE_MARGIN = 0.1;
const BACK_MARGIN = 0.2;
/** The rear works stands this far behind the line dividing its parcel from the house's. */
export const REAR_FRONT_GAP_METERS = 0.05;

export const pairedRearTrade = (modelId: string | undefined): OpusRearTrade | undefined =>
  modelId ? PAIRED_TRADES[modelId] : undefined;

/** What the house in front leaves the plot for the yard and the shallowest rear works. */
export const REAR_RESERVE_METERS = REAR_YARD_METERS + REAR_FRONT_GAP_METERS + OPUS_REAR_WORKS_MIN_DEPTH + BACK_MARGIN;

const assets = new Map<string, LandmarkAsset>();
const cached = (key: string, make: () => LandmarkAsset) => {
  let asset = assets.get(key);
  if (!asset) {
    asset = make();
    assets.set(key, asset);
  }
  return asset;
};

/** The trade's shop-house at the plot's front, with its dwelling (as a trade workhome). */
export const shopHouseAsset = (trade: OpusRearTrade): LandmarkAsset =>
  cached(`shop:${trade}`, () => ({
    ...bvFacilityAsset(opusShopHouseModelId(trade), [
      opusWorkhomeLayout(opusWorkhomePreset(trade, "standard")).entrance
    ]),
    residentialDwellings: 1
  }));

/** The trade's rear works on its preset envelope: its name and provenance for the placed building. */
export const rearWorksAsset = (trade: OpusRearTrade): LandmarkAsset =>
  cached(`rear:${trade}`, () =>
    bvFacilityAsset(opusRearWorksModelId(trade), [opusRearWorksLayout(opusRearWorksPreset(trade)).entrance])
  );

export type RearWorksFit = Required<Pick<OpusRearWorksExterior, "widthMeters" | "depthMeters" | "mirror">>;

/**
 * The rear works fitted to its plot: as wide as the frontage leaves on its grid (3–8 m), as deep as its preset or what
 * the plot leaves behind the house and yard (5 m at least). Undefined where it does not fit.
 */
export function fitRearWorks(frontage: number, depthLeft: number, mirror: boolean): RearWorksFit | undefined {
  const step = (v: number, s: number) => Math.floor(v / s + 1e-9) * s;
  const width = Math.min(OPUS_REAR_WORKS_MAX_WIDTH, step(frontage - 2 * SIDE_MARGIN, OPUS_REAR_WORKS_WIDTH_STEP)),
    depth = Math.min(
      OPUS_REAR_WORKS_PRESET_ENVELOPE[1],
      step(depthLeft - REAR_FRONT_GAP_METERS - BACK_MARGIN, OPUS_REAR_WORKS_DEPTH_STEP)
    );
  if (width < OPUS_REAR_WORKS_MIN_WIDTH || depth < OPUS_REAR_WORKS_MIN_DEPTH) return;
  return { widthMeters: width, depthMeters: depth, mirror };
}

/** The rear works placed behind `house`: whether a placement is one (it reports no facility of its own). */
export const isRearWorks = (p: VectorPlacement | undefined) => !!p?.building?.annexOf;
