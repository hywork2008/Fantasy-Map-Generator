// Public entry for the City Generator engine.

export { generateCity } from "./core/pipeline";
export type { Cell, CityParams, GenerationResult, GridStage, Point } from "./core/types";
export { PRESETS, type PresetId, presetParams } from "./site/presets";
