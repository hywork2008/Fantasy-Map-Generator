import * as THREE from "three";
import {
  createRegionalHouse,
  REGIONAL_HOUSES,
  type RegionalCover,
  type RegionalHouseSpec,
  regionalHouseSpecKey
} from "../../buildings/houses/regionalHouses";
import type { BuildingLot } from "../../city-editor/generators/buildingLots.types";
import type { Point } from "../../city-editor/types/primitives";
import { growthRandom } from "../../utils/urbanMorphology";
import { type BvDefinition, type BvPlacement, type BvPrototypeCache, createBvInstances } from "./bvInstances";

// Prototypes are shared by every lot with the same spec; the cache disposes them with their last layer.
const definitions = new Map<string, BvDefinition>();
function definitionFor(spec: RegionalHouseSpec): BvDefinition {
  const key = regionalHouseSpecKey(spec);
  let definition = definitions.get(key);
  if (!definition) {
    definition = { id: `regional-house:${key}`, create: () => createRegionalHouse(spec) };
    definitions.set(key, definition);
  }
  return definition;
}

function isConvex(ring: readonly Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < ring.length; i++) {
    const [a, b, c] = [ring[i], ring[(i + 1) % ring.length], ring[(i + 2) % ring.length]];
    const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(turn) < 1e-7) continue;
    if (sign && Math.sign(turn) !== sign) return false;
    sign = Math.sign(turn);
  }
  return sign !== 0;
}

function area(ring: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

/** Nominal eave of a prototype with this many storeys. */
function prototypeEave(storeys: number): number {
  return REGIONAL_HOUSES.ground + (storeys - 1) * REGIONAL_HOUSES.upper;
}

export interface RegionalHouseSite extends BvPlacement {
  lotIndex: number;
}

/**
 * Place the detailed regional house on every rectangular gable or hipped lot with a regional appearance.
 * Each lot keeps its own footprint, eave height, roof pitch, coverings and colours; other lots keep CE massing.
 */
export function regionalHouseSite(lot: BuildingLot, lotIndex: number, elevation = 0): RegionalHouseSite | undefined {
  const massing = lot.massing;
  const appearance = lot.appearance;
  if (!massing || !appearance || lot.landmark || appearance.profileId === "legacy") return;
  const form = massing.roof.form;
  if ((form !== "gable" && form !== "hip") || lot.polygon.length < 4 || !isConvex(lot.polygon)) return;
  const a = massing.roof.ridgeAzimuth;
  const r = [Math.cos(a), Math.sin(a)];
  const p = [-Math.sin(a), Math.cos(a)];
  const along = lot.polygon.map(q => q[0] * r[0] + q[1] * r[1]);
  const across = lot.polygon.map(q => q[0] * p[0] + q[1] * p[1]);
  const depth = Math.max(...along) - Math.min(...along);
  const width = Math.max(...across) - Math.min(...across);
  // Only near-rectangular lots: the model's walls fill its bounding box.
  if (!(width > 0 && depth > 0) || area(lot.polygon) < 0.8 * width * depth) return;
  const storeys = Math.max(1, Math.min(5, Math.round(massing.storeys)));
  const sx = width / REGIONAL_HOUSES.width;
  const sz = depth / REGIONAL_HOUSES.depth;
  const sy = massing.eaveHeightMeters / prototypeEave(storeys);
  if (sx < 0.35 || sx > 3.5 || sz < 0.35 || sz > 3.5 || sy < 0.6 || sy > 1.7) return;
  // Non-uniform scaling changes the slope; pre-tilt the prototype so the placed roof keeps the lot's pitch.
  const pitch = Math.atan((Math.tan(THREE.MathUtils.degToRad(massing.roof.pitchDeg)) * sx) / sy);
  const pitchDeg = Math.min(64, Math.max(16, Math.round(THREE.MathUtils.radToDeg(pitch) / 4) * 4));
  const material = massing.roof.material;
  const cover: RegionalCover =
    material === "thatch" || material === "turf"
      ? "thatch"
      : material === "tile"
        ? appearance.profileId === "mediterranean"
          ? "coppi"
          : "tile"
        : appearance.roofPaletteId === "local-stone-roof"
          ? "stone"
          : "tile";
  const finish = appearance.wallFinish;
  const id = lot.id ?? `${lot.faceId}:${lotIndex}`;
  const spec: RegionalHouseSpec = {
    profile: appearance.profileId,
    storeys,
    pitchDeg,
    roofForm: form,
    cover,
    roof: appearance.roofPaletteId,
    wall: appearance.wallPaletteId,
    frame: appearance.framePaletteId,
    finish:
      finish === "plaster-infill"
        ? "frame"
        : finish === "timber-boarding"
          ? "boarding"
          : finish === "stone"
            ? "stone"
            : "masonry",
    quoins: finish === "limewash" || finish === "brick",
    jetty: massing.jettyMeters > 0 ? 0.4 : 0,
    shade: appearance.shadeBin,
    variant: Math.min(2, Math.floor(growthRandom(`regional-house:${id}`) * 3)) as 0 | 1 | 2
  };
  const along0 = (Math.max(...along) + Math.min(...along)) / 2;
  const across0 = (Math.max(...across) + Math.min(...across)) / 2;
  const centre: Point = [r[0] * along0 + p[0] * across0, r[1] * along0 + p[1] * across0];
  // The front gable (local +Z) maps to +r; turn it toward the town centre, where most streets lead.
  const flip = centre[0] * r[0] + centre[1] * r[1] > 0;
  const angle = a + Math.PI / 2 + (flip ? Math.PI : 0);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(centre[0], elevation + massing.baseElevationMeters, -centre[1]),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle),
    new THREE.Vector3(sx, sy, sz)
  );
  return { id, lotIndex, definition: definitionFor(spec), matrix };
}

export function createTownRegionalHouses(
  lots: readonly BuildingLot[],
  cache: BvPrototypeCache,
  foundationAt?: (ring: Point[]) => number
) {
  const sites: RegionalHouseSite[] = [];
  lots.forEach((lot, index) => {
    const site = regionalHouseSite(lot, index, lot.massing ? (foundationAt?.(lot.polygon) ?? 0) : 0);
    if (site) sites.push(site);
  });
  const layer = createBvInstances(sites, cache);
  layer.group.name = "ce-regional-houses";
  return { ...layer, replaced: new Set(layer.accepted.map(site => site.lotIndex)) };
}
export type TownRegionalHouses = ReturnType<typeof createTownRegionalHouses>;
