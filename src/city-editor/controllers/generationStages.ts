import { editorText } from "../../i18n/editorMessages";
import { GENERATION_STAGE_DEFINITIONS, generationStageDefinitions } from "../generators/generation/stages";
import type { GenerationSettings, GenerationStage } from "../types/generation";

export const GENERATION_STAGES: GenerationStage[] = GENERATION_STAGE_DEFINITIONS.map(stage => ({
  id: stage.id,
  step: stage.step,
  processStep: stage.processStep,
  ...(stage.wallCheckpoint ? { wallCheckpoint: stage.wallCheckpoint } : {}),
  labelKey: stage.labelKey,
  get label() {
    return editorText(this.labelKey);
  },
  hintKey: stage.hintKey,
  get hint() {
    return editorText(this.hintKey);
  }
}));

/** Keep the original slider sequence; the experiment exposes the old curtain
 * and its passages before the outer-wall checkpoints. */
export function generationStages(settings: GenerationSettings): GenerationStage[] {
  const definitions = generationStageDefinitions(settings);
  if (definitions === GENERATION_STAGE_DEFINITIONS) return GENERATION_STAGES;
  return definitions.map(definition => ({
    ...GENERATION_STAGES.find(stage => stage.id === definition.id)!,
    ...definition,
    label: editorText(definition.labelKey),
    hint: editorText(definition.hintKey)
  }));
}
