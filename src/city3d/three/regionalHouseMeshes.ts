import * as THREE from "three";
import {
  createRegionalHouse,
  createRegionalHouseGeometry,
  REGIONAL_HOUSE_QUALITIES,
  type RegionalCover,
  type RegionalHouseQuality,
  type RegionalHouseSpec,
  regionalHouseSpecKey
} from "../../buildings/houses/regionalHouses";
import { type ModelQuality, resolveModelQuality } from "../../buildings/modelQuality";
import type { BuildingLot } from "../../city-editor/generators/buildingLots.types";
import type { Point } from "../../city-editor/types/primitives";
import { growthRandom } from "../../utils/urbanMorphology";
import { type BvDefinition, type BvPlacement, type BvPrototypeCache, createBvInstances } from "./bvInstances";

// Prototypes are shared by every lot with the same spec; the cache disposes them with their last layer.
const definitions = new Map<string, BvDefinition>();
function definitionFor(spec: RegionalHouseSpec, quality: RegionalHouseQuality): BvDefinition {
  const key = `${regionalHouseSpecKey(spec)}|${quality}`;
  let definition = definitions.get(key);
  if (!definition) {
    definition = {
      id: `regional-house:${key}`,
      create: () => createRegionalHouse(spec, quality),
      createGeometry: () => createRegionalHouseGeometry(spec, quality)
    };
    definitions.set(key, definition);
    if (definitions.size > 512) definitions.delete(definitions.keys().next().value!);
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

export interface RegionalHouseSite extends BvPlacement {
  lotIndex: number;
}

/**
 * Place the detailed regional house on every rectangular gable or hipped lot with a regional appearance.
 * Each lot keeps its measured footprint, floor heights, roof pitch, coverings and colours; other lots keep CE massing.
 */
export function regionalHouseSite(
  lot: BuildingLot,
  lotIndex: number,
  elevation = 0,
  quality: ModelQuality = "standard"
): RegionalHouseSite | undefined {
  const massing = lot.massing;
  const appearance = lot.appearance;
  if (!massing || !appearance || lot.landmark || appearance.profileId === "legacy") return;
  // Outbuildings and non-domestic premises need their own model families.
  if (lot.role && !["main", "wing", "workshop", "store"].includes(lot.role)) return;
  const groundUse = massing.floors[0]?.use;
  if (!groundUse || !["residential", "retail", "craft", "storage"].includes(groundUse)) return;
  if (massing.storeys < 1 || massing.storeys > 5 || massing.floors.length !== massing.storeys) return;
  if (
    massing.floors.some(
      floor => !Number.isFinite(floor.heightMeters) || floor.heightMeters < 2.5 || floor.heightMeters > 5
    )
  )
    return;
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
  if (!(width >= 3 && width <= 18 && depth >= 4 && depth <= 28) || area(lot.polygon) < 0.999999 * width * depth) return;
  const storeys = massing.storeys;
  const height = massing.floors.reduce((sum, floor) => sum + floor.heightMeters, 0);
  if (Math.abs(height - massing.eaveHeightMeters) > 1e-5) return;
  // Match CE's roof-rise cap without quantizing the slope or stretching any joinery.
  const upperWidth = width + 2 * Math.min(1.2, massing.jettyMeters * (storeys - 1));
  const rise = Math.min(4, (Math.tan(THREE.MathUtils.degToRad(massing.roof.pitchDeg)) * upperWidth) / 2);
  const pitchDeg = THREE.MathUtils.radToDeg(Math.atan2(rise, upperWidth / 2));
  if (!Number.isFinite(pitchDeg) || pitchDeg <= 0 || pitchDeg > 65) return;
  const material = massing.roof.material;
  const cover: RegionalCover =
    material === "tile"
      ? appearance.profileId === "mediterranean"
        ? "coppi"
        : "tile"
      : material === "slate" && appearance.roofPaletteId === "local-stone-roof"
        ? "stone"
        : material;
  const finish = appearance.wallFinish;
  const id = lot.id ?? `${lot.faceId}:${lotIndex}`;
  const spec: RegionalHouseSpec = {
    profile: appearance.profileId,
    width,
    depth,
    floorHeights: massing.floors.map(floor => floor.heightMeters),
    groundUse: groundUse as RegionalHouseSpec["groundUse"],
    attached: true,
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
    jetty: massing.jettyMeters,
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
    new THREE.Vector3(1, 1, 1)
  );
  return {
    id,
    lotIndex,
    definition: definitionFor(spec, resolveModelQuality(quality, REGIONAL_HOUSE_QUALITIES)),
    matrix
  };
}

export function createTownRegionalHouses(
  lots: readonly BuildingLot[],
  cache: BvPrototypeCache,
  foundationAt?: (ring: Point[]) => number,
  quality: ModelQuality = "standard"
) {
  const sites: RegionalHouseSite[] = [];
  lots.forEach((lot, index) => {
    const site = regionalHouseSite(lot, index, lot.massing ? (foundationAt?.(lot.polygon) ?? 0) : 0, quality);
    if (site) sites.push(site);
  });
  const layer = createBvInstances(sites, cache);
  layer.group.name = "ce-regional-houses";
  return { ...layer, replaced: new Set(layer.accepted.map(site => site.lotIndex)) };
}
export type TownRegionalHouses = ReturnType<typeof createTownRegionalHouses>;
