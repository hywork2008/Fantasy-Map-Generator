import * as THREE from "three";
import { meshProjection } from "../../buildings/meshProjection";
import { SHIP_VARIANTS } from "../../buildings/ships/shipVariants";
import { adopt } from "../../city3d/adoption";
import type { ModelShipType } from "../types/ships";

/** Model Viewer ships the editor can place by hand; the sailing studies exist at their high tier only. */
const MODEL_SHIP_VARIANTS: Record<ModelShipType, { family: string; level: string }> = {
  "ship-of-the-line": { family: "ship.ship-of-the-line", level: "high" },
  "war-galley": { family: "ship.galley", level: "high" },
  trireme: { family: "ship.trireme", level: "high" },
  carrier: { family: "ship.carrier", level: "default" }
};

export function modelShipVariant(type: ModelShipType) {
  const { family, level } = MODEL_SHIP_VARIANTS[type];
  return adopt(SHIP_VARIANTS, family, level);
}

/** Overall extent of a model ship along its keel (X) and across it (Z), with the X centre. */
export function modelShipExtent(model: { group: THREE.Object3D }) {
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  return {
    length: bounds.max.x - bounds.min.x,
    beam: bounds.max.z - bounds.min.z,
    centerX: (bounds.min.x + bounds.max.x) / 2,
    centerZ: (bounds.min.z + bounds.max.z) / 2
  };
}

interface ModelShipPlan {
  /** The drawing as one image: a ship of the line has tens of thousands of faces. */
  href: string;
  /** Image box in model metres (x along the keel, y = model z). */
  box: [number, number, number, number];
  length: number;
  centerX: number;
  centerZ: number;
}
const plans = new Map<ModelShipType, ModelShipPlan>();

/**
 * Top-down drawing of a model ship from its own mesh faces, cached per type, in model metres with the bow toward
 * +X and starboard toward +Z.
 */
export function modelShipPlan(type: ModelShipType) {
  let plan = plans.get(type);
  if (!plan) {
    const model = modelShipVariant(type).create();
    try {
      const extent = modelShipExtent(model);
      const svg = meshProjection(model, "top"),
        box = svg
          .match(/viewBox="([^"]+)"/)![1]
          .split(" ")
          .map(Number) as ModelShipPlan["box"];
      plan = { href: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, box, ...extent };
    } finally {
      model.dispose();
    }
    plans.set(type, plan);
  }
  return plan;
}
