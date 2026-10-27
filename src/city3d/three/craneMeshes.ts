import * as THREE from "three";
import { models } from "../../buildings/medieval/35-harbor-cranesModels";
import { createMedievalContainerModel } from "../../buildings/props/medievalContainers";
import type { HarborCargoPile, HarborCrane } from "../../city-editor/generators/harborFabric";
import type { Point } from "../../city-editor/types/primitives";
import { planVertex } from "../core/planFrame";
import { LAND_Y } from "../core/waterGeometry";
import { type BvPrototypeCache, createBvInstances } from "./bvInstances";

/** Place BV cranes at the same sites and water-facing angles as the town plan. */
export function createTownCranes(
  cranes: readonly HarborCrane[],
  heightAt: (point: Point) => number,
  cache: BvPrototypeCache
) {
  const sites = cranes.map(crane => ({
    id: crane.id,
    definition: crane.kind === "treadwheel" ? models[0] : models[1],
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(...planVertex(crane.point, LAND_Y + heightAt(crane.point))),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), crane.armAngleRad),
      new THREE.Vector3(1, 1, 1)
    )
  }));
  const result = createBvInstances(sites, cache);
  result.group.name = "ce-harbor-cranes";
  for (const mesh of result.pickables) mesh.raycast = () => {};
  return result;
}

const barrel = { id: "harbor-barrel", create: () => createMedievalContainerModel("barrel", "closed") };

/** Match the five barrel positions in the 2D cargo pile. */
export function createTownHarborBarrels(
  piles: readonly HarborCargoPile[],
  heightAt: (point: Point) => number,
  cache: BvPrototypeCache
) {
  const sites = piles
    .filter(pile => pile.kind === "barrels")
    .flatMap(pile => {
      const hw = pile.widthMeters / 2,
        hh = pile.heightMeters / 2,
        r = 0.55;
      const offsets = [
        [-hw + r, -hh + r],
        [0, -hh + r],
        [hw - r, -hh + r],
        [-hw * 0.5, hh - r],
        [hw * 0.5, hh - r]
      ];
      const c = Math.cos(pile.rotation),
        s = Math.sin(pile.rotation);
      return offsets.map(([x, y], index) => {
        // SVG local Y points down; convert its rotated offset back to plan coordinates.
        const point: Point = [pile.point[0] + x * c + y * s, pile.point[1] + x * s - y * c];
        return {
          id: `${pile.id}:${index}`,
          definition: barrel,
          matrix: new THREE.Matrix4().makeTranslation(...planVertex(point, LAND_Y + heightAt(point)))
        };
      });
    });
  const result = createBvInstances(sites, cache);
  result.group.name = "ce-harbor-barrels";
  for (const mesh of result.pickables) mesh.raycast = () => {};
  return result;
}
