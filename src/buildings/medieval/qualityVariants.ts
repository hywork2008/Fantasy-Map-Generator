import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import type { MedievalModel } from "./modelKit";

/** Keep each original factory as Low and register independently constructed High editions. */
export function registerHighVariants(models: MedievalModel[], factories: Record<string, () => CityStructureMeshes>) {
  for (const model of models) {
    const high = factories[model.id];
    if (!high) throw new Error(`Missing High factory for ${model.id}`);
    const author = model.author ?? DEFAULT_AUTHOR;
    const family = `medieval.${model.id}`;
    model.variants = (["low", "high"] as const).map(level => ({
      id: variantId(family, level, author),
      family,
      level,
      author,
      label: level === "low" ? "Low" : "High",
      create: level === "low" ? () => model.create() : high
    }));
  }
}
