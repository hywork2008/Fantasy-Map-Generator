import * as THREE from "three";
import {
  createEarthenHouse,
  createEarthenHouseGeometry,
  type EarthenHouseSpec,
  earthenHouseSpecKey
} from "../../buildings/houses/earthenHouses";
import {
  createPolygonHouse,
  createPolygonHouseGeometry,
  type PolygonHouseSpec,
  polygonHouseSpecKey
} from "../../buildings/houses/polygonHouses";
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
import type {
  BuildingFrontage,
  BuildingFrontageCandidate,
  BuildingFrontageResolver
} from "../../city-editor/generators/buildingFrontage";
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
      cacheKey: `regional-house:${key}`,
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
  frontage: BuildingFrontage;
}

/** Earthen terraces follow the actual convex walls, including narrow and trapezoidal lots. */
function earthenHouseSite(
  lot: BuildingLot,
  lotIndex: number,
  elevation: number,
  quality: ModelQuality,
  resolveFrontage?: BuildingFrontageResolver
): RegionalHouseSite | undefined {
  const massing = lot.massing!;
  if (massing.wall !== "mudbrick" || massing.jettyMeters !== 0 || !isConvex(lot.polygon) || area(lot.polygon) < 1)
    return;
  const center = lot.polygon.reduce<Point>(
    (sum, p) => [sum[0] + p[0] / lot.polygon.length, sum[1] + p[1] / lot.polygon.length],
    [0, 0]
  );
  const signedArea = lot.polygon.reduce((sum, a, i) => {
    const b = lot.polygon[(i + 1) % lot.polygon.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  const candidates = lot.polygon.map((a, i) => {
    const b = lot.polygon[(i + 1) % lot.polygon.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return {
      kind: "eave" as const,
      flip: false,
      door: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point,
      normal: [
        (Math.sign(signedArea) * (b[1] - a[1])) / length,
        (-Math.sign(signedArea) * (b[0] - a[0])) / length
      ] as Point,
      length
    };
  });
  if (candidates.some(candidate => candidate.length < 0.05)) return;
  const usable = candidates.filter(candidate => candidate.length >= 1.2);
  if (!usable.length) return;
  usable.sort((a, b) => b.length - a.length);
  const frontage = resolveFrontage?.(lot, usable) ?? { ...usable[0], source: "unknown" as const };
  const entranceEdge = candidates.findIndex(
    candidate => Math.hypot(candidate.door[0] - frontage.door[0], candidate.door[1] - frontage.door[1]) < 1e-6
  );
  if (entranceEdge < 0) return;
  const spec: EarthenHouseSpec = {
    footprint: lot.polygon.map(p => [p[0] - center[0], -(p[1] - center[1])]),
    floorHeights: massing.floors.map(floor => floor.heightMeters),
    entranceEdge,
    groundUse: massing.floors[0].use as EarthenHouseSpec["groundUse"],
    wall: lot.appearance!.wallPaletteId,
    roof: lot.appearance!.roofPaletteId,
    shade: lot.appearance!.shadeBin
  };
  const tier = resolveModelQuality(quality, REGIONAL_HOUSE_QUALITIES);
  const key = `earthen-house:${earthenHouseSpecKey(spec)}|${tier}`;
  let definition = definitions.get(key);
  if (!definition) {
    definition = {
      id: key,
      cacheKey: key,
      create: () => createEarthenHouse(spec, tier),
      createGeometry: () => createEarthenHouseGeometry(spec, tier)
    };
    definitions.set(key, definition);
    if (definitions.size > 512) definitions.delete(definitions.keys().next().value!);
  }
  return {
    id: lot.id ?? `${lot.faceId}:${lotIndex}`,
    lotIndex,
    frontage,
    definition,
    matrix: new THREE.Matrix4().makeTranslation(center[0], elevation + massing.baseElevationMeters, -center[1])
  };
}

/** Detailed joinery follows measured walls when a rectangular prototype cannot fit. */
function polygonHouseSite(
  lot: BuildingLot,
  lotIndex: number,
  elevation: number,
  quality: ModelQuality,
  resolveFrontage?: BuildingFrontageResolver
): RegionalHouseSite | undefined {
  if (area(lot.polygon) < 1 || lot.polygon.length < 3) return;
  const center = lot.polygon.reduce<Point>(
    (sum, p) => [sum[0] + p[0] / lot.polygon.length, sum[1] + p[1] / lot.polygon.length],
    [0, 0]
  );
  const signedArea = lot.polygon.reduce((sum, a, i) => {
    const b = lot.polygon[(i + 1) % lot.polygon.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  const candidates = lot.polygon.flatMap((a, i) => {
    const b = lot.polygon[(i + 1) % lot.polygon.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1.2) return [];
    return [
      {
        kind: "eave" as const,
        flip: false,
        door: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point,
        normal: [
          (Math.sign(signedArea) * (b[1] - a[1])) / length,
          (-Math.sign(signedArea) * (b[0] - a[0])) / length
        ] as Point
      }
    ];
  });
  if (!candidates.length) return;
  const frontage = resolveFrontage?.(lot, candidates) ?? { ...candidates[0], source: "unknown" as const };
  const spec: PolygonHouseSpec = {
    footprint: lot.polygon.map(p => [p[0] - center[0], p[1] - center[1]]),
    massing: { ...lot.massing!, baseElevationMeters: 0 },
    appearance: lot.appearance!,
    entrance: [frontage.door[0] - center[0], frontage.door[1] - center[1]]
  };
  const tier = resolveModelQuality(quality, REGIONAL_HOUSE_QUALITIES);
  const key = `polygon-house:${polygonHouseSpecKey(spec)}|${tier}`;
  let definition = definitions.get(key);
  if (!definition) {
    definition = {
      id: key,
      cacheKey: key,
      create: () => createPolygonHouse(spec, tier),
      createGeometry: () => createPolygonHouseGeometry(spec, tier)
    };
    definitions.set(key, definition);
    if (definitions.size > 512) definitions.delete(definitions.keys().next().value!);
  }
  return {
    id: lot.id ?? `${lot.faceId}:${lotIndex}`,
    lotIndex,
    frontage,
    definition,
    matrix: new THREE.Matrix4().makeTranslation(center[0], elevation + lot.massing!.baseElevationMeters, -center[1])
  };
}

/**
 * Place regional houses on measured lots, using polygonal joinery when rectangular prototypes cannot fit.
 * Each lot keeps its measured footprint, floor heights, roof pitch, coverings and colours; other lots keep CE massing.
 */
export function regionalHouseSite(
  lot: BuildingLot,
  lotIndex: number,
  elevation = 0,
  quality: ModelQuality = "standard",
  resolveFrontage?: BuildingFrontageResolver
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
  const height = massing.floors.reduce((sum, floor) => sum + floor.heightMeters, 0);
  if (Math.abs(height - massing.eaveHeightMeters) > 1e-5) return;
  const form = massing.roof.form;
  if (form === "flat")
    return (
      earthenHouseSite(lot, lotIndex, elevation, quality, resolveFrontage) ??
      polygonHouseSite(lot, lotIndex, elevation, quality, resolveFrontage)
    );
  if (form !== "gable" && form !== "hip") return;
  if (lot.polygon.length < 4 || !isConvex(lot.polygon))
    return polygonHouseSite(lot, lotIndex, elevation, quality, resolveFrontage);
  const a = massing.roof.ridgeAzimuth;
  const r = [Math.cos(a), Math.sin(a)];
  const p = [-Math.sin(a), Math.cos(a)];
  const along = lot.polygon.map(q => q[0] * r[0] + q[1] * r[1]);
  const across = lot.polygon.map(q => q[0] * p[0] + q[1] * p[1]);
  const depth = Math.max(...along) - Math.min(...along);
  const width = Math.max(...across) - Math.min(...across);
  // Only near-rectangular lots: the model's walls fill its bounding box.
  if (!(width >= 3 && width <= 18 && depth >= 4 && depth <= 28) || area(lot.polygon) < 0.999999 * width * depth)
    return polygonHouseSite(lot, lotIndex, elevation, quality, resolveFrontage);
  const storeys = massing.storeys;
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
  const along0 = (Math.max(...along) + Math.min(...along)) / 2;
  const across0 = (Math.max(...across) + Math.min(...across)) / 2;
  const centre: Point = [r[0] * along0 + p[0] * across0, r[1] * along0 + p[1] * across0];
  const variant = Math.min(2, Math.floor(growthRandom(`regional-house:${id}`) * 3)) as 0 | 1 | 2;
  const doorSide = variant === 1 ? -1 : 1;
  const candidates: BuildingFrontageCandidate[] = [false, true].flatMap(flip => {
    const sign = flip ? -1 : 1;
    return [
      {
        kind: "gable" as const,
        flip,
        door: [
          centre[0] + sign * ((r[0] * depth) / 2 + p[0] * doorSide * width * 0.25),
          centre[1] + sign * ((r[1] * depth) / 2 + p[1] * doorSide * width * 0.25)
        ] as Point,
        normal: [sign * r[0], sign * r[1]] as Point
      },
      {
        kind: "eave" as const,
        flip,
        door: [
          centre[0] + sign * ((p[0] * width) / 2 - r[0] * doorSide * depth * 0.25),
          centre[1] + sign * ((p[1] * width) / 2 - r[1] * doorSide * depth * 0.25)
        ] as Point,
        normal: [sign * p[0], sign * p[1]] as Point
      }
    ];
  });
  const frontage: BuildingFrontage = resolveFrontage?.(lot, candidates) ?? { ...candidates[0], source: "unknown" };
  const spec: RegionalHouseSpec = {
    profile: appearance.profileId,
    width,
    depth,
    floorHeights: massing.floors.map(floor => floor.heightMeters),
    groundUse: groundUse as RegionalHouseSpec["groundUse"],
    entranceFace: frontage.kind,
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
    variant
  };
  const angle = a + Math.PI / 2 + (frontage.flip ? Math.PI : 0);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(centre[0], elevation + massing.baseElevationMeters, -centre[1]),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle),
    new THREE.Vector3(1, 1, 1)
  );
  return {
    id,
    lotIndex,
    frontage,
    definition: definitionFor(spec, resolveModelQuality(quality, REGIONAL_HOUSE_QUALITIES)),
    matrix
  };
}

export function createTownRegionalHouses(
  lots: readonly BuildingLot[],
  cache: BvPrototypeCache,
  foundationAt?: (ring: Point[]) => number,
  quality: ModelQuality = "standard",
  resolveFrontage?: BuildingFrontageResolver
) {
  const sites: RegionalHouseSite[] = [];
  lots.forEach((lot, index) => {
    const site = regionalHouseSite(
      lot,
      index,
      lot.massing ? (foundationAt?.(lot.polygon) ?? 0) : 0,
      quality,
      resolveFrontage
    );
    if (site) sites.push(site);
  });
  const layer = createBvInstances(sites, cache);
  layer.group.name = "ce-regional-houses";
  return { ...layer, replaced: new Set(layer.accepted.map(site => site.lotIndex)) };
}
export type TownRegionalHouses = ReturnType<typeof createTownRegionalHouses>;
