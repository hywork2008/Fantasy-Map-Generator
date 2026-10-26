import * as THREE from "three";
import { expect, it } from "vitest";
import { objectDrawing, PLACEABLE_OBJECTS } from "../../buildings/placeableObjects";
import type { CityElement } from "../../city-editor/types/document";
import { createTownObjects } from "./objectMeshes";

it.each(PLACEABLE_OBJECTS)(
  "renders the BV $id model at the requested size, orientation and ground height",
  definition => {
    const item: CityElement = {
      id: "placed",
      kind: "object",
      faceIds: [],
      locked: false,
      point: [37, -12],
      objectType: definition.id,
      objectScale: 1.5,
      rotation: Math.PI / 2
    };
    const layer = createTownObjects([item], () => 8);
    try {
      expect(layer.accepted).toHaveLength(1);
      const bounds = new THREE.Box3().setFromObject(layer.group);
      const original = objectDrawing(definition).bounds.getSize(new THREE.Vector3());
      expect(bounds.min.y).toBeCloseTo(8, 4);
      expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(37, 4);
      expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(12, 4);
      const size = bounds.getSize(new THREE.Vector3());
      expect(size.x).toBeCloseTo(original.z * 1.5, 4);
      expect(size.y).toBeCloseTo(original.y * 1.5, 4);
      expect(size.z).toBeCloseTo(original.x * 1.5, 4);
    } finally {
      layer.dispose();
    }
  }
);
