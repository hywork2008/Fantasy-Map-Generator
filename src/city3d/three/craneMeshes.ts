import * as THREE from "three";
import { models } from "../../buildings/medieval/35-harbor-cranesModels";
import { createMedievalContainerModel, MEDIEVAL_CONTAINERS } from "../../buildings/props/medievalContainers";
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
const crate = { id: "harbor-crate", create: () => createMedievalContainerModel("crate", "closed") };

/** Match BV containers to the barrel circles and crate rectangles in the 2D cargo piles. */
export function createTownHarborCargo(
  piles: readonly HarborCargoPile[],
  heightAt: (point: Point) => number,
  cache: BvPrototypeCache
) {
  const sites = piles
    .filter(pile => pile.kind === "barrels" || pile.kind === "crates")
    .flatMap(pile => {
      const hw = pile.widthMeters / 2,
        hh = pile.heightMeters / 2,
        r = 0.55;
      const offsets =
        pile.kind === "barrels"
          ? [
              [-hw + r, -hh + r],
              [0, -hh + r],
              [hw - r, -hh + r],
              [-hw * 0.5, hh - r],
              [hw * 0.5, hh - r]
            ]
          : [
              [-hw + pile.widthMeters * 0.3, 0],
              [-hw + pile.widthMeters * 0.725, pile.heightMeters * 0.025]
            ];
      const c = Math.cos(pile.rotation),
        s = Math.sin(pile.rotation);
      return offsets.map(([x, y], index) => {
        // SVG local Y points down; convert its rotated offset back to plan coordinates.
        const point: Point = [pile.point[0] + x * c + y * s, pile.point[1] + x * s - y * c];
        return {
          id: `${pile.id}:${index}`,
          definition: pile.kind === "barrels" ? barrel : crate,
          matrix: new THREE.Matrix4().compose(
            new THREE.Vector3(...planVertex(point, LAND_Y + heightAt(point))),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pile.rotation),
            pile.kind === "barrels"
              ? new THREE.Vector3(1, 1, 1)
              : new THREE.Vector3(
                  (pile.widthMeters * (index === 0 ? 0.6 : 0.55)) / MEDIEVAL_CONTAINERS.crate.width,
                  1,
                  (pile.heightMeters * (index === 0 ? 1 : 0.85)) / MEDIEVAL_CONTAINERS.crate.depth
                )
          )
        };
      });
    });
  const result = createBvInstances(sites, cache);
  result.group.name = "ce-harbor-cargo";
  for (const mesh of result.pickables) mesh.raycast = () => {};
  return result;
}
