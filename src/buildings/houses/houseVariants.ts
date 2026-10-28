import type * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { type ModelVariant, variantId } from "../modelVariants";
import { createEarthenHouse, createEarthenHouseGeometry, EARTHEN_HOUSES, type EarthenHouseSpec } from "./earthenHouses";
import { createPolygonHouse, createPolygonHouseGeometry, POLYGON_HOUSES, type PolygonHouseSpec } from "./polygonHouses";
import {
  createRegionalHouse,
  createRegionalHouseGeometry,
  REGIONAL_HOUSE_QUALITIES,
  REGIONAL_HOUSES,
  type RegionalHouseSpec
} from "./regionalHouses";

type Quality = (typeof REGIONAL_HOUSE_QUALITIES)[number];

/** One variant per quality tier; CE passes each lot's spec when it builds a prototype. */
export function tiers<Spec>(
  family: string,
  author: Author,
  create: (spec: Spec, quality: Quality) => CityStructureMeshes,
  createGeometry?: (spec: Spec, quality: Quality) => THREE.BufferGeometry
): ModelVariant<[Spec]>[] {
  return REGIONAL_HOUSE_QUALITIES.map(level => ({
    id: variantId(family, level, author),
    family,
    level,
    author,
    create: spec => create(spec, level),
    ...(createGeometry ? { createGeometry: (spec: Spec) => createGeometry(spec, level) } : {})
  }));
}

export const REGIONAL_HOUSE_VARIANTS = tiers<RegionalHouseSpec>(
  "house.regional",
  REGIONAL_HOUSES.author,
  createRegionalHouse,
  createRegionalHouseGeometry
);
export const EARTHEN_HOUSE_VARIANTS = tiers<EarthenHouseSpec>(
  "house.earthen",
  EARTHEN_HOUSES.author,
  createEarthenHouse,
  createEarthenHouseGeometry
);
export const POLYGON_HOUSE_VARIANTS = tiers<PolygonHouseSpec>(
  "house.polygon",
  POLYGON_HOUSES.author,
  createPolygonHouse,
  createPolygonHouseGeometry
);
