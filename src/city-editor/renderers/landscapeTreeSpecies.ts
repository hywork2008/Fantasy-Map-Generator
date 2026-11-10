import type { TreeSpecies } from "../../buildings/landscape/trees";
import { treeSpeciesForClimate } from "../generators/landscapeTreeSpecies";

export { treeSpeciesForClimate } from "../generators/landscapeTreeSpecies";

import { landscapeClimate } from "../generators/landscapeVegetation";
import type { CityDocument, Point } from "../types/document";

/** Site climate adapts a preferred planting; undefined explicitly forbids generated trees. */
export function landscapeTreeSpecies(
  preferred: TreeSpecies,
  document: CityDocument | undefined,
  point: Point,
  context: "planting" | "woodland" = "planting"
): TreeSpecies | undefined {
  if (!document) return preferred;
  return treeSpeciesForClimate(
    preferred,
    { ...landscapeClimate(document), seed: document.generationSeed ?? document.fabric?.seed ?? "landscape" },
    point,
    context
  );
}
