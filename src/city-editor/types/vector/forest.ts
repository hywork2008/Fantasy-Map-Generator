import type { ForestSettings } from "../contracts/forest";
import type { VectorPolygon } from "./generation";

/** Woodland raised by the forest settings (P7b), by the mesh editor's land-cover rules; trees are drawn from it. */
export interface VectorForest {
  mode: ForestSettings["mode"];
  density: ForestSettings["density"];
  regions: VectorPolygon[];
  areaM2: number;
}
