import * as THREE from "three";
import {
  placementCatalog,
  placementDefinition,
  placementFootprint,
  placementQualities
} from "../../buildings/placementModels";
import type { LandmarkAsset, Point } from "../types/document";

/** Measure the selected BV geometry once, in authored meters, with its actual entrance coordinates. */
export function bvFacilityAsset(
  modelId: string,
  entrances: readonly { id: string; position: readonly number[]; normalXZ?: readonly number[]; clearWidth: number }[],
  quality: "low" | "high" = "low"
): LandmarkAsset {
  if (!entrances.length) throw new Error(`BV facility ${modelId} requires an entrance`);
  const qualities = placementQualities(modelId);
  if ((qualities.length && !qualities.includes(quality)) || !placementDefinition(modelId, quality))
    throw new Error(`Unsupported BV facility ${modelId}:${quality}`);
  const footprint = placementFootprint(modelId, quality)!;
  const width = footprint.halfX * 2,
    depth = footprint.halfZ * 2;
  const model = placementDefinition(modelId, quality)!.create();
  let heightMeters: number;
  try {
    heightMeters = new THREE.Box3().setFromObject(model.group, true).getSize(new THREE.Vector3()).y;
  } finally {
    model.dispose();
  }
  const outer: Point[] = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2]
  ];
  return {
    id: `bv-facility:${modelId}:${quality}`,
    revision: "1",
    name: placementCatalog().find(m => m.id === modelId)!.name,
    historicalPhase: "medieval",
    referenceSizeMeters: [width, depth],
    dimensionSource: "BV measured geometry at authored scale",
    provenanceId: `bv:${modelId}`,
    bvModel: { id: modelId, quality, heightMeters },
    footprint: [{ outer, holes: [] }],
    minimumSite: [{ outer, holes: [] }],
    entrances: entrances.map(e => ({
      id: e.id,
      point: [e.position[0] - footprint.centerX, -(e.position[2] - footprint.centerZ)],
      outward: [e.normalXZ?.[0] ?? 0, -(e.normalXZ?.[1] ?? 1)],
      widthMeters: e.clearWidth,
      required: true
    })),
    renderSvg: `<svg xmlns="http://www.w3.org/2000/svg"><rect x="${-width / 2}" y="${-depth / 2}" width="${width}" height="${depth}" fill="#d8bd86" stroke="#735e36"/></svg>`
  };
}
