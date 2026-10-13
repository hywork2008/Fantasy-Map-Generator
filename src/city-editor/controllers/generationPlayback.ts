import { editorText } from "../../i18n/editorMessages";
import { clearGenerationPreviewCache } from "../generators/generation/previews";
import { generationPhaseLabel } from "../generators/generationDiagnostics";
import { clone } from "../generators/mesh";
import type { DisplayState, DocumentsState, GenerationState, InteractionState } from "../state/editorSession";
import type { GenerationDebugPreview } from "../types/contracts/generationDebug";
import type { GenerationSample } from "../types/contracts/generationDiagnostics";
import { emptySelection } from "./tools/toolTypes";

export interface GenerationPlaybackContext {
  stepStatus: HTMLOutputElement;
  clearGridEvo: () => void;
  rebuildEditorIndexes: () => void;
  failureDebugSummary: HTMLDivElement;
  closeFailurePreview: HTMLButtonElement;
  refresh: () => void;
  redrawMap: () => void;
  generationLog: { reset: () => void; append: (sample: GenerationSample, seed: string) => void };
  documents: Pick<DocumentsState, "documentState" | "history">;
  interaction: Pick<InteractionState, "inspectedInfo" | "tool" | "selection" | "activeGroupId">;
  generation: Pick<
    GenerationState,
    | "completeResult"
    | "generateSeed"
    | "currentStageStep"
    | "completeSource"
    | "generationHistory"
    | "completeResultSettings"
    | "generateSettings"
    | "lastGeneratedStep"
    | "activeStepStage"
    | "stepIndex"
    | "urbanCoreHighlight"
    | "stepOverlayPaths"
    | "failureRenderContext"
    | "failurePreview"
    | "failurePreviewHistoryIndex"
  >;
  display: Pick<DisplayState, "hideBuildings" | "hideStreetLines">;
}

/** Live getters prevent snapshots of the current document or UI state. */
export function createGenerationPlaybackController(ctx: GenerationPlaybackContext) {
  function rememberGenerationState(
    seed = ctx.generation.completeResult?.generationSeed ??
      ctx.documents.documentState.generationSeed ??
      ctx.generation.generateSeed,
    stage = ctx.generation.currentStageStep
  ): void {
    if (!ctx.generation.completeSource) return;
    ctx.generation.generationHistory.set(ctx.documents.history.currentEntryKey, {
      source: ctx.generation.completeSource,
      result: ctx.generation.completeResult,
      resultSettings: ctx.generation.completeResultSettings,
      settings: clone(ctx.generation.generateSettings),
      seed,
      stage,
      lastStage: ctx.generation.lastGeneratedStep,
      activeStage: ctx.generation.activeStepStage,
      stepIndex: ctx.generation.stepIndex,
      stepStatus: ctx.stepStatus.textContent ?? "",
      coreHighlight: ctx.generation.urbanCoreHighlight ? new Set(ctx.generation.urbanCoreHighlight) : null,
      overlayPaths: ctx.generation.stepOverlayPaths ? clone(ctx.generation.stepOverlayPaths) : null,
      hideBuildings: ctx.display.hideBuildings,
      hideStreetLines: ctx.display.hideStreetLines
    });
  }

  function rememberFailureGenerationState(): void {
    if (ctx.generation.failureRenderContext && ctx.generation.completeSource) rememberGenerationState();
  }

  function showFailurePreview(preview: GenerationDebugPreview, heading: string): void {
    ctx.generation.failurePreview = preview;
    ctx.generation.failureRenderContext = preview;
    const partial = structuredClone(preview.document);
    partial.generationSeed = preview.seed;
    ctx.documents.documentState = ctx.documents.history.commit(
      partial,
      editorText("cityEditor.messages.generationFailurePreviewCityEditorPage")
    );
    ctx.generation.failurePreviewHistoryIndex = ctx.documents.history.index;
    ctx.generation.completeResult = null;
    clearGenerationPreviewCache();
    ctx.generation.completeResultSettings = null;
    ctx.generation.lastGeneratedStep = null;
    ctx.generation.activeStepStage = null;
    ctx.generation.stepIndex = -1;
    ctx.stepStatus.textContent = "";
    ctx.generation.urbanCoreHighlight = null;
    ctx.generation.stepOverlayPaths = null;
    ctx.display.hideBuildings = false;
    ctx.display.hideStreetLines = false;
    ctx.interaction.inspectedInfo = null;
    ctx.clearGridEvo();
    ctx.rebuildEditorIndexes();
    const { sample, seed, highlights } = preview;
    ctx.failureDebugSummary.textContent = editorText(
      "cityEditor.messages.seedThePreviewIsEditableHighlightsReflectDiagnosticsAtFailure",
      {
        value0: heading,
        value1: generationPhaseLabel(sample.phase),
        value2: sample.phase,
        value3: sample.failure?.message ?? "",
        value4: sample.failure?.reason ?? "",
        value5: seed,
        value6: highlights.contextual
          ? editorText("cityEditor.messages.relatedAreaHighlightExplanation")
          : editorText("cityEditor.messages.failureHighlightExplanation")
      }
    );
    ctx.failureDebugSummary.hidden = false;
    ctx.closeFailurePreview.hidden = false;
    rememberGenerationState(preview.seed);
    ctx.interaction.tool = "select";
    ctx.interaction.selection = emptySelection();
    ctx.interaction.activeGroupId = null;
    ctx.refresh();
  }

  function clearFailurePreview(): void {
    const wasVisible = ctx.generation.failurePreview !== null;
    ctx.generation.failurePreview = null;
    ctx.generation.failurePreviewHistoryIndex = null;
    ctx.failureDebugSummary.hidden = true;
    ctx.closeFailurePreview.hidden = true;
    if (wasVisible) ctx.redrawMap();
  }

  function appendGenerationException(error: unknown, seed: string): void {
    ctx.generationLog.append(
      {
        phase: "runtime",
        elapsedMs: 0,
        attempt: 1,
        failure: { reason: "generation-exception", message: error instanceof Error ? error.message : String(error) }
      },
      seed
    );
  }

  return {
    rememberGenerationState,
    rememberFailureGenerationState,
    showFailurePreview,
    clearFailurePreview,
    appendGenerationException
  };
}
