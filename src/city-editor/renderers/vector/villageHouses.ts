import type { VillageHouseKind, VillageHouseProfile } from "../../../buildings/medieval/opusVillageHouses";
import { growthRandom } from "../../../utils/urbanMorphology";
import { polygonCentroid } from "../../generators/geom";
import { cellHouseCount, cellHouseRing, unpackPoints } from "../../generators/vector/fabric/pack";
import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorFabricCell } from "../../types/vector/fabric";
import { vectorHouseProfile } from "./houseAppearance";
import type { VillageHouse3d } from "./renderData";

/** A footprint at least this long is a longhouse (plan §14.2: 12–19 m); a shorter home is a cottage. */
const LONGHOUSE_MIN_METERS = 11.5;
/** Model sizes are kept to this step, so houses of nearly one size share one instanced model. */
const SIZE_STEP_METERS = 0.25;

/** The region whose walls and roofs the village models take: the town's housing culture, the old default English. */
export function vectorVillageProfile(
  doc: Pick<VectorCityDocument, "context" | "recipe" | "site">
): VillageHouseProfile {
  const profile = vectorHouseProfile(doc);
  return !profile || profile === "legacy" ? "atlantic" : profile;
}

const step = (v: number) => Math.round(v / SIZE_STEP_METERS) * SIZE_STEP_METERS;

/**
 * The model of a village cell's building `index` (docs/plan/ce-meshless-roadside-burgage-village.md V4): a barn when
 * it houses no one, else a longhouse or cottage by its length. The model's front turns to the road the house's
 * entrance reaches; a barn, end on to the road, turns its doors to its toft's yard, towards the toft's house.
 */
export function villageHouse3d(
  cell: VectorFabricCell,
  index: number,
  profile: VillageHouseProfile,
  id: string
): VillageHouse3d {
  const ring = cellHouseRing(cell, index),
    center = polygonCentroid(ring),
    edge = (i: number): Point => [
      ring[(i + 1) % ring.length][0] - ring[i][0],
      ring[(i + 1) % ring.length][1] - ring[i][1]
    ],
    a = edge(0),
    b = edge(1),
    [long, short] = Math.hypot(...a) >= Math.hypot(...b) ? [a, b] : [b, a],
    length = Math.hypot(...long),
    width = Math.hypot(...short),
    barn = cell.houses.dwellings[index] === 0,
    kind: VillageHouseKind = barn ? "barn" : length >= LONGHOUSE_MIN_METERS ? "longhouse" : "cottage";
  let towards: Point;
  if (barn) {
    // The nearest home of the street block is the barn's own toft's house.
    let best: Point | undefined,
      gap = Infinity;
    for (let i = 0; i < cellHouseCount(cell); i++) {
      if (i === index || cell.houses.dwellings[i] === 0) continue;
      const c = polygonCentroid(cellHouseRing(cell, i)),
        d = Math.hypot(c[0] - center[0], c[1] - center[1]);
      if (d < gap) {
        gap = d;
        best = c;
      }
    }
    towards = best ? [best[0] - center[0], best[1] - center[1]] : [0, 0];
  } else {
    const [, access] = unpackPoints(cell.houses.entrances, cell.origin, 2 * index, 2 * index + 2);
    towards = [access[0] - center[0], access[1] - center[1]];
  }
  let angle = Math.atan2(long[1], long[0]);
  // The model's front (+z) lies at (sin, -cos) of its angle in the CE frame.
  if (Math.sin(angle) * towards[0] - Math.cos(angle) * towards[1] < 0) angle += Math.PI;
  return {
    spec: {
      kind,
      profile,
      length: step(length),
      width: step(width),
      variant: growthRandom(id) < 0.5 ? 0 : 1
    },
    center,
    angle
  };
}
