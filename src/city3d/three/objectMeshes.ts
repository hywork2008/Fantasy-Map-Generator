import * as THREE from "three";
import { objectDrawing, placeableObject } from "../../buildings/placeableObjects";
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
    const definition = item.kind === "object" ? placeableObject(item.objectType) : undefined;
    if (!definition || !item.point) return [];
    const { bounds } = objectDrawing(definition);
    const scale = objectScale(item.objectScale);
    const center = bounds.getCenter(new THREE.Vector3());
    const matrix = new THREE.Matrix4()
      .compose(
        new THREE.Vector3(item.point[0], heightAt?.(item.point) ?? 0, -item.point[1]),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.rotation ?? 0),
        new THREE.Vector3(scale, scale, scale)
      )
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
    return [{ id: item.id, definition: objectDefinition(definition.id), matrix }];
  });
  const layer = createBvInstances(sites, cache);
  layer.group.name = "ce-objects";
  return layer;
}
