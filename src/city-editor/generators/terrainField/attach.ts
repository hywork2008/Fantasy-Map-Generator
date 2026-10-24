import type { BurgSiteTerrain } from "../../types/contracts/burgSiteDescriptor";
import type { CityDocument } from "../../types/document";
import type { GenerationSettings } from "../../types/generationSettings";

type FieldSettings = Pick<GenerationSettings, "terrainField" | "descriptor">;

import { facePoints } from "../mesh";
import { buildTerrainFieldRecipe, coarseFromHeightfield } from "./build";
import { fieldFromParts } from "./conform";
import { FIELD_SAMPLE_METERS, fieldModeAllowed } from "./constants";
import { buildRiverCorridors } from "./corridor";
import { faceMeanElevation, markUnbuildableSlopes } from "./lots";
import { sampleField, slopeField } from "./sample";

export function recipeSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** Write the height-field recipe, cell means, and unbuildable steep land. Castle faces stay buildable. */
export function attachTerrainField(document: CityDocument, settings: FieldSettings, seed: string): void {
  const choice = settings.terrainField;
  if (!choice || !fieldModeAllowed(document.frame.extentMeters)) return;
  const coarseField = settings.descriptor?.terrain?.heightfield;
  const coarse = coarseField
    ? coarseFromHeightfield(coarseField.size, coarseField.spacingMeters, coarseField.elevationsMeters)
    : null;
  const recipe = buildTerrainFieldRecipe({
    template: choice.template,
    seed: recipeSeed(`${seed}:${choice.template}`),
    extentMeters: document.frame.extentMeters,
    sampleMeters: choice.sampleMeters ?? FIELD_SAMPLE_METERS,
    ...(coarse ? { coarse } : {})
  });
  const features =
    document.terrain?.features.filter(feature => feature.kind === "platform" && feature.role === "terrace") ?? [];
  const ramps = document.terrain?.ramps;
  document.terrain = {
    version: 1,
    features,
    ...(ramps?.length ? { ramps } : {}),
    field: recipe
  };
  const field = fieldFromParts(document.frame.extentMeters, recipe.sampleMeters, recipe.parts);
  document.terrain.features.push(...buildRiverCorridors(document, field));
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.water !== "land") continue;
    face.properties.elevation = faceMeanElevation(facePoints(document.mesh, face), point => sampleField(field, point));
  }
  markUnbuildableSlopes(document, point => slopeField(field, point));
}

export function sitingTerrainFromField(
  settings: FieldSettings,
  extentMeters: number,
  seed: string
): { terrain: BurgSiteTerrain; summit: [number, number] } | null {
  const choice = settings.terrainField;
  if (!choice || !fieldModeAllowed(extentMeters)) return null;
  const coarseField = settings.descriptor?.terrain?.heightfield;
  const coarse = coarseField
    ? coarseFromHeightfield(coarseField.size, coarseField.spacingMeters, coarseField.elevationsMeters)
    : null;
  const recipe = buildTerrainFieldRecipe({
    template: choice.template,
    seed: recipeSeed(`${seed}:${choice.template}`),
    extentMeters,
    sampleMeters: choice.sampleMeters ?? FIELD_SAMPLE_METERS,
    ...(coarse ? { coarse } : {})
  });
  const field = fieldFromParts(extentMeters, recipe.sampleMeters, recipe.parts);
  const size = 33;
  const spacing = extentMeters / (size - 1);
  const origin = extentMeters / 2;
  const elevationsMeters: number[] = [];
  let peak = -Infinity;
  let summit: [number, number] = [0, 0];
  for (let row = 0; row < size; row++)
    for (let column = 0; column < size; column++) {
      const point: [number, number] = [-origin + column * spacing, -origin + row * spacing];
      const height = sampleField(field, point);
      elevationsMeters.push(height);
      if (height > peak) {
        peak = height;
        summit = point;
      }
    }
  return {
    summit,
    terrain: {
      elevationMeters: peak,
      downhillAzimuthDeg: null,
      gradePercent: 0,
      heightfield: { size, spacingMeters: spacing, elevationsMeters, waterMask: elevationsMeters.map(() => 0 as const) }
    }
  };
}
