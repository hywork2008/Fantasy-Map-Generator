import * as THREE from "three";
import { objectDrawing, placeableObject } from "../../buildings/placeableObjects";
import { placementPose } from "../../buildings/placementContract";
import { placementDefinition, placementFootprint } from "../../buildings/placementModels";
import { OBJECT_VARIANTS } from "../../buildings/siteVariants";
import { objectScale } from "../../city-editor/generators/objectPlacement";
import type { CityElement, Point } from "../../city-editor/types/document";
import { adoptedDefinition } from "../adoption";
import { type BvDefinition, type BvPrototypeCache, createBvInstances } from "./bvInstances";

const definitions = new Map<string, BvDefinition>();
function objectDefinition(id: string): BvDefinition {
  let result = definitions.get(id);
  if (!result) {
    result = adoptedDefinition(OBJECT_VARIANTS, `object.${id}`, id);
    definitions.set(id, result);
  }
  return result;
}

export function createTownObjects(
  elements: readonly CityElement[],
  heightAt?: (point: Point) => number,
  cache?: BvPrototypeCache
) {
  const sites = elements.flatMap(item => {
    if (item.kind !== "object" || !item.point || !item.objectType) return [];
    const placeable = placeableObject(item.objectType);
    if (placeable) {
      const { bounds } = objectDrawing(placeable);
      const scale = objectScale(item.objectScale);
      const center = bounds.getCenter(new THREE.Vector3());
      const matrix = new THREE.Matrix4()
        .compose(
          new THREE.Vector3(item.point[0], heightAt?.(item.point) ?? 0, -item.point[1]),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.rotation ?? 0),
          new THREE.Vector3(scale, scale, scale)
        )
        .multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
      return [{ id: item.id, definition: objectDefinition(placeable.id), matrix }];
    }
    const definition = placementDefinition(item.objectType);
    const footprint = placementFootprint(item.objectType);
    if (!definition || !footprint) return [];
    const pose = placementPose(item.point, heightAt?.(item.point) ?? 0, item.rotation ?? 0, footprint);
    const matrix = new THREE.Matrix4()
      .compose(
        new THREE.Vector3(pose.position[0], pose.position[1], pose.position[2]),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.rotationY),
        new THREE.Vector3(1, 1, 1)
      )
      .multiply(
        new THREE.Matrix4().makeTranslation(pose.preTranslation[0], pose.preTranslation[1], pose.preTranslation[2])
      );
    return [{ id: item.id, definition, matrix }];
  });
  const layer = createBvInstances(sites, cache);
  layer.group.name = "ce-objects";
  return layer;
}
