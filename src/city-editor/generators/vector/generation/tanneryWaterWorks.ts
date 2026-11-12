import { DEDICATED_TANNERY } from "../../../../buildings/medieval/dedicatedTanneryProfile";
import { placementFootprint } from "../../../../buildings/placementModels";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument, VectorPlacement } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { allVectorWater } from "../geometry/water";

const WET_TANNERY_MODEL = "trade-workshop.dedicated-wet-tannery";
/** Farthest a yard's back may stand from the water for its channels to reach it (revetment plus slack). */
const CHANNEL_REACH_METERS = 8;
/** How far a channel runs on into the water, so its mouth reads as open. */
const CHANNEL_MOUTH_METERS = 0.4;

const waterCache = new WeakMap<VectorCityDocument, VectorPolygon[]>();

/**
 * A wet tannery's water works (tanners' row plan T2b): its intake and effluent channels, each square to the yard's
 * back from its port out to the water, and the revetment between the yard and the bank (the yard's reserved ground
 * beyond its footprint). Undefined for any other placement.
 */
export function tanneryWaterWorks(
  doc: VectorCityDocument,
  p: VectorPlacement
): { channels: VectorPolygon[]; revetment: VectorPolygon[] } | undefined {
  if (p.modelId !== WET_TANNERY_MODEL || !p.building) return undefined;
  const fp = placementFootprint(WET_TANNERY_MODEL, "low");
  if (!fp) return undefined;
  let water = waterCache.get(doc);
  if (!water) {
    water = allVectorWater(doc);
    waterCache.set(doc, water);
  }
  const wet = (q: Point) => water!.some(w => containsRegion([w], q));
  // The model's plan frame is (x, -z) (bvFacilityAsset): its back (-z, the water side) is local +y.
  const a = (p.facingDegrees * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    mx = p.mirrored ? -1 : 1,
    world = (x: number, y: number): Point => [x * mx * c - y * s + p.position[0], x * mx * s + y * c + p.position[1]],
    back: Point = [-s, c],
    along: Point = [c * mx, s * mx];
  const channels: VectorPolygon[] = [];
  for (const port of DEDICATED_TANNERY.waterPorts) {
    const start = world(port.position[0] - fp.centerX, fp.halfZ),
      half = port.channelWidth / 2;
    let reach: number | undefined;
    for (let d = 0; d <= CHANNEL_REACH_METERS; d += 0.1)
      if (wet([start[0] + back[0] * d, start[1] + back[1] * d])) {
        reach = d + CHANNEL_MOUTH_METERS;
        break;
      }
    if (reach === undefined || reach < 0.05) continue;
    const end: Point = [start[0] + back[0] * reach, start[1] + back[1] * reach];
    channels.push({
      outer: [
        [start[0] - along[0] * half, start[1] - along[1] * half],
        [start[0] + along[0] * half, start[1] + along[1] * half],
        [end[0] + along[0] * half, end[1] + along[1] * half],
        [end[0] - along[0] * half, end[1] - along[1] * half]
      ],
      holes: []
    });
  }
  let revetment: VectorPolygon[] = [];
  try {
    revetment = regionBoolean(p.building.reserved, p.building.footprint, "difference").filter(r => regionArea(r) > 0.5);
  } catch {
    revetment = [];
  }
  return { channels, revetment };
}
