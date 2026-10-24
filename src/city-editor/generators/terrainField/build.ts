import type { CityDocument, Point } from "../../types/document";
import type { TerrainField, TerrainFieldPart, TerrainFieldRecipe, TerrainTemplateId } from "../../types/terrain";
import { facePoints } from "../mesh";
import {
  type CoarseHeightfield,
  carveRivers,
  conformWater,
  fieldFromParts,
  lowFrequencyError,
  type RiverCarve,
  type WaterRing
} from "./conform";
import { FIELD_SAMPLE_METERS } from "./constants";
import { templateParts } from "./templates";

export interface FieldRecipeInput {
  template: TerrainTemplateId;
  seed: number;
  extentMeters: number;
  sampleMeters?: number;
  /** FMG or synthetic  coarse height lattice the fine field must keep as its low frequency. */
  coarse?: CoarseHeightfield;
}

/** Recipe for a template. A coarse lattice is stored as parts so a reload does not need the source map. */
export function buildTerrainFieldRecipe(input: FieldRecipeInput): TerrainFieldRecipe {
  const sampleMeters = input.sampleMeters ?? FIELD_SAMPLE_METERS;
  const parts: TerrainFieldPart[] = templateParts(input.template, input.seed, input.extentMeters);
  if (input.coarse) {
    parts.unshift({ kind: "coarse", ...input.coarse });
    const drafted = fieldFromParts(input.extentMeters, sampleMeters, parts);
    parts.push({
      kind: "correct",
      origin: input.coarse.origin,
      spacingMeters: input.coarse.spacingMeters,
      columns: input.coarse.columns,
      rows: input.coarse.rows,
      elevationsMeters: lowFrequencyError(drafted, input.coarse)
    });
  }
  return { version: 1, template: input.template, seed: input.seed, sampleMeters, parts };
}

export function coarseFromHeightfield(
  size: number,
  spacingMeters: number,
  elevationsMeters: readonly number[]
): CoarseHeightfield | null {
  if (size < 2 || elevationsMeters.length !== size * size) return null;
  const origin = -((size - 1) * spacingMeters) / 2;
  return {
    origin: [origin, origin],
    spacingMeters,
    columns: size,
    rows: size,
    elevationsMeters: [...elevationsMeters]
  };
}

function waterRings(document: CityDocument): WaterRing[] {
  const rings: WaterRing[] = [];
  for (const area of document.waterAreas ?? []) rings.push({ polygon: area.polygon, elevation: 0 });
  for (const ring of document.regionalWaterAreas ?? []) rings.push({ polygon: ring, elevation: 0 });
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.water !== "sea" && face.properties.water !== "lake") continue;
    const polygon = facePoints(document.mesh, face);
    if (polygon.length >= 3) rings.push({ polygon, elevation: 0 });
  }
  return rings;
}

function riversOf(document: CityDocument): RiverCarve[] {
  if (document.riverFlows?.length)
    return document.riverFlows
      .filter(flow => flow.points.length >= 2)
      .map(flow => ({ points: flow.points, widthMeters: flow.widthMeters }));
  const rivers: RiverCarve[] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "river") continue;
    const points = group.vertices.flatMap(id => {
      const point = document.mesh.vertices[id]?.point;
      return point ? [point] : [];
    });
    if (points.length >= 2) rivers.push({ points, widthMeters: group.style.widthMeters });
  }
  return rivers;
}

function roundPoint(point: Point): string {
  return `${Math.round(point[0])},${Math.round(point[1])}`;
}

function fieldStamp(document: CityDocument, recipe: TerrainFieldRecipe): string {
  const water = waterRings(document).map(ring => `${ring.elevation}:${ring.polygon.map(roundPoint).join(" ")}`);
  const rivers = riversOf(document).map(river => `${river.widthMeters}:${river.points.map(roundPoint).join(" ")}`);
  return JSON.stringify([document.frame.extentMeters, recipe, water, rivers]);
}

const cache = new Map<string, TerrainField>();

/** Rebuild the height field from the saved recipe and the document's water. */
export function terrainFieldForDocument(document: CityDocument): TerrainField | null {
  const recipe = document.terrain?.field;
  if (!recipe?.parts?.length || !(recipe.sampleMeters > 0)) return null;
  const key = fieldStamp(document, recipe);
  const hit = cache.get(key);
  if (hit) return hit;
  const field = fieldFromParts(document.frame.extentMeters, recipe.sampleMeters, recipe.parts);
  conformWater(field, waterRings(document));
  carveRivers(field, riversOf(document));
  cache.set(key, field);
  if (cache.size > 4) cache.delete(cache.keys().next().value!);
  return field;
}

/** Drop a cached grid after a test replaces the recipe in place. */
export function clearTerrainFieldCache(): void {
  cache.clear();
}
