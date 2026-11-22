import * as THREE from "three";
import { type VillageHouseSpec, villageHouseDefinition } from "../../buildings/medieval/opusVillageHouses";
import { type BvPrototypeCache, createBvInstances } from "./bvInstances";

/** One village building: its model spec, its centre in the scene's plan frame (x east, y north), ground and turn. */
export interface VillageHouseSite {
  id: string;
  spec: VillageHouseSpec;
  center: readonly [number, number];
  elevation: number;
  /** Radians in the plan frame: the model's +x along the house's long side. */
  angle: number;
}

/**
 * The roadside village's buildings as instanced Opus village models (docs/plan/ce-meshless-roadside-burgage-village.md
 * V4): houses of one spec share one model. The model is centred on its footprint, so it stands at the house's centre.
 */
export function createTownVillageHouses(
  houses: readonly VillageHouseSite[],
  cache: BvPrototypeCache,
  quality: "low" | "high"
) {
  const sites = houses.map(house => ({
    id: house.id,
    definition: villageHouseDefinition(house.spec, quality),
    // Plan y runs north, the scene's -z; a turn by the plan angle is the same turn about +y.
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(house.center[0], house.elevation, -house.center[1]),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), house.angle),
      new THREE.Vector3(1, 1, 1)
    )
  }));
  const layer = createBvInstances(sites, cache);
  layer.group.name = "ce-village-houses";
  return layer;
}
