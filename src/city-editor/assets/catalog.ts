import type { LandmarkAsset } from "../core/types";
import chartres from "./chartres-prototype.json";
import pantheon from "./pantheon-prototype.json";
import sanVitale from "./san-vitale-prototype.json";

/** Bundled, offline schematic studies. Each placed asset is copied into the saved document. */
export const historicLandmarkPrototypes: LandmarkAsset[] = [
  pantheon,
  sanVitale,
  chartres
] as unknown as LandmarkAsset[];
