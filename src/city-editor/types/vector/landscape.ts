import type { TreeSpecies } from "../../../buildings/landscape/treeSpecies";
import type { BurialCultureProfile } from "../../../data/burialCultures";
import type { BurgCivilization } from "../../../data/civilizationTraditions";
import type { ForestSettings } from "../contracts/forest";
import type { LandscapeClimate } from "../contracts/landscape";
import type { FarmPlot } from "../contracts/ruralFields";
import type { CemeteryPlan, Point } from "../document";
import type { VectorPolygon } from "./generation";

export interface VectorLandscapeTree {
  id: string;
  ownerId: string;
  point: Point;
  radiusMeters: number;
  heightMeters: number;
  angleRadians: number;
  species: TreeSpecies;
}
export interface VectorLandscapeFarm extends Omit<FarmPlot, "faceId" | "sourceFaceIds" | "polygon"> {
  id: string;
  polygon: VectorPolygon;
  locked: boolean;
}
export interface VectorLandscape {
  version: 1;
  context: LandscapeClimate & { seed: string; civilization?: BurgCivilization; burialProfile?: BurialCultureProfile };
  forest: {
    settings: ForestSettings;
    /** Resolved eligible domains retain the original openings and site exclusions for each mode. */
    domains: Record<ForestSettings["mode"], VectorPolygon[]>;
    farmland: VectorPolygon[];
    regionIds: string[];
    farmRegionIds: string[];
  };
  parks: { id: string; lawns: VectorPolygon[]; paths: Point[][]; trees: { point: Point; radiusMeters: number }[] }[];
  farmSources: VectorLandscapeFarm[];
  farms: VectorLandscapeFarm[];
  cemeteries: Omit<CemeteryPlan, "faceId">[];
  trees: VectorLandscapeTree[];
}
