import * as THREE from "three";
import { isMarketModel } from "../../buildings/medieval/marketPresentation";
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

const mirroredDefinitions = new WeakMap<BvDefinition, BvDefinition>();
/** One mirrored definition per model definition, so mirrored instances share their baked prototype. */
function mirrored(definition: BvDefinition): BvDefinition {
  let result = mirroredDefinitions.get(definition);
  if (!result) {
    result = {
      ...definition,
      id: `${definition.id}:mirrored`,
      ...(definition.cacheKey ? { cacheKey: `${definition.cacheKey}:mirrored` } : {}),
      mirrorX: true
    };
    mirroredDefinitions.set(definition, result);
  }
  return result;
}

export function createTownObjects(
  elements: readonly CityElement[],
  heightAt?: (point: Point) => number,
  cache?: BvPrototypeCache,
  options?: { lod?: boolean }
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
    const plain = placementDefinition(item.objectType, item.objectQuality, item.objectPalette, {
      activity: item.objectMarketActivity
    });
    const authored = placementFootprint(item.objectType, item.objectQuality);
    if (!plain || !authored) return [];
    // A mirrored placement draws the model's mirror image, whose footprint centre lies mirrored too.
    const definition = item.objectMirrored ? mirrored(plain) : plain,
      footprint = item.objectMirrored ? { ...authored, centerX: -authored.centerX } : authored;
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
  const byId = new Map(elements.map(e => [e.id, e]));
  const farSites = options?.lod
    ? sites.flatMap(site => {
        const item = byId.get(site.id)!;
        if (!item.objectType || !isMarketModel(item.objectType)) return [];
        const definition = placementDefinition(item.objectType, item.objectQuality, item.objectPalette, {
          activity: item.objectMarketActivity,
          detail: "distant"
        });
        return definition ? [{ ...site, definition }] : [];
      })
    : [];
  const far = createBvInstances(farSites, cache);
  if (farSites.length) layer.group.add(far.group);
  far.setVisible(() => false);
  const distant = new Set<string>();
  const position = new THREE.Vector3();
  return {
    ...layer,
    pickables: [...layer.pickables, ...far.pickables],
    resolve(hit: Pick<THREE.Intersection, "object" | "instanceId">) {
      return layer.resolve(hit) ?? far.resolve(hit);
    },
    update(camera: THREE.PerspectiveCamera, viewportHeight: number): boolean {
      if (!farSites.length) return false;
      const projection = (viewportHeight * camera.zoom) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      for (const site of farSites) {
        const item = byId.get(site.id)!;
        position.setFromMatrixPosition(site.matrix);
        const width = placementFootprint(item.objectType!, item.objectQuality)!.halfX * 2;
        const pixels = (width * projection) / Math.max(1, camera.position.distanceTo(position));
        if (pixels < (distant.has(site.id) ? 28 : 20)) distant.add(site.id);
        else distant.delete(site.id);
      }
      const nearChanged = layer.setVisible(site => !distant.has(site.id));
      const farChanged = far.setVisible(site => distant.has(site.id));
      return nearChanged || farChanged;
    },
    dispose() {
      far.dispose();
      layer.dispose();
    }
  };
}
