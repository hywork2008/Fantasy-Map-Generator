export { GENERATION_STAGES, generationStages } from "../controllers/generationStages";
export { runPlan } from "../generators/generation/pipeline";

export {
  defaultGenerationSettings,
  defaultStreetSettings,
  randomGeography,
  randomSeed,
  resolveEffectiveLayout,
  resolveStreetSettings,
  riversForCount
} from "../generators/generation/settings";
export type {
  GenerationSettings,
  GenerationStage,
  GenerationStepResult,
  StageCheckpoint,
  StreetSettings,
  UrbanPatchStep
} from "../types/generation";

import type { FarNodeMode } from "./gen/streets";

export {
  COMPLETE_CITY_ATTEMPTS,
  generateCityAttempt,
  generateCityOnDocument
} from "../generators/generation/generateCity";
export {
  clearGenerationPreviewCache,
  generateCoastWalkStep,
  generateGateStep,
  generateRiverWalkStep,
  generateRoadStep,
  generateStageOnDocument,
  generateUrbanPatchStep,
  generateWardStep
} from "../generators/generation/previews";
export { completeRoadRouter } from "../generators/generation/routing/completeRoadRouter";
export { dryTownApproachLine } from "../generators/generation/routing/dryApproaches";
export { countExternalApproachRoads } from "../generators/generation/routing/roadCounts";
export type { CityFeatureSet, CityLayout, SiteConfig } from "./gen/site/siteConfig";
export { CITY_LAYOUTS, FEATURE_KEYS } from "./gen/site/siteConfig";
export type { FarNodeMode };
