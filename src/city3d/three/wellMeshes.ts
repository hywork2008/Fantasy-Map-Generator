import * as THREE from "three";
import { WELL_VARIANTS } from "../../buildings/siteVariants";
import type { Point } from "../../city-editor/types/primitives";
import { adoptedDefinition } from "../adoption";
import { planVertex } from "../core/planFrame";
import { type BvPrototypeCache, createBvInstances } from "./bvInstances";

export interface WellSite {
  id: string;
  point: Point;
  kind?: "well" | "publicBasin";
}
const WELL = adoptedDefinition(WELL_VARIANTS, "well.medieval", "well");
const BASIN = adoptedDefinition(WELL_VARIANTS, "well.publicBasin", "publicBasin");

/** One shared, vertex-colored BV prototype per waterwork kind, retaining the BV origin and scale. */
export function createTownWells(
  sites: readonly WellSite[],
  heightAt?: (point: Point) => number,
  cache?: BvPrototypeCache
) {
  const layer = createBvInstances(
    sites.map(site => ({
      ...site,
      definition: site.kind === "publicBasin" ? BASIN : WELL,
      matrix: new THREE.Matrix4().makeTranslation(...planVertex(site.point, heightAt?.(site.point) ?? 0))
    })),
    cache
  );
  layer.group.name = "ce-wells";
  return layer;
}
export type TownWells = ReturnType<typeof createTownWells>;
