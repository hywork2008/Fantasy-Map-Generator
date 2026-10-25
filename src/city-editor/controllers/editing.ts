import { editorText } from "../../i18n/editorMessages";
import { bastionedEditRejection } from "../generators/bastionedTown/edit";
import { refreshCastleLayouts } from "../generators/castleLayout";
import { sizePresetForExtent } from "../generators/document";
import { validateFortifications } from "../generators/fortifications";
import { clearGenerationPreviewCache } from "../generators/generation/previews";
import { defaultGenerationSettings } from "../generators/generation/settings";
import { clone } from "../generators/mesh";
import type { DisplayState, DocumentsState, GenerationState, InteractionState } from "../state/editorSession";
import type { CityDocument } from "../types/document";
import { emptySelection } from "./tools/toolTypes";
export interface EditingContext {
  scope: import("../services/editorLifetime").EditorLifetime;
  documents: DocumentsState;
  refresh: () => void;
  generation: GenerationState;
  showNotice: (value: string, redraw?: boolean) => void;
  clearGridEvo: () => void;
  rememberFailureGenerationState: () => void;
  rebuildEditorIndexes: () => void;
  stepStatus: HTMLOutputElement;
  display: DisplayState;
  size: HTMLSelectElement;
  syncStageUi: (step: number) => void;
  syncGenerateControls: () => void;
  interaction: InteractionState;
}
export function createEditingController(ctx: EditingContext) {
  function commit(next: CityDocument, label = editorText("cityEditor.messages.edit")): void {
    if (!ctx.scope.active) return;
    ctx.documents.lastOutputDocInput = null;
    ctx.documents.lastOutputDocResult = null;
    // A no-op edit (re-selecting the same ward, scale ×1, re-applying "sea" to a
    // sea cell) returns the document unchanged. Skip the snapshot so it does not
    // add an empty undo step or a History-panel row.
    if (next === ctx.documents.documentState) {
      ctx.refresh();
      return;
    }
    const fortificationErrors = validateFortifications(next);
    const existingErrors = ctx.generation.failureRenderContext
      ? new Set(validateFortifications(ctx.documents.documentState))
      : new Set<string>();
    const preservesExistingErrors =
      ctx.generation.failureRenderContext && fortificationErrors.every(error => existingErrors.has(error));
    if (
      fortificationErrors.length &&
      !preservesExistingErrors &&
      (!refreshCastleLayouts(next) || validateFortifications(next).length)
    ) {
      ctx.showNotice(editorText("cityEditor.messages.thisEditCannotPreserveCastleIntegrityCheckTheCastleArea"));
      return;
    }
    if (bastionedEditRejection(ctx.documents.documentState, next)) {
      ctx.showNotice(editorText("cityEditor.messages.bastionedEditRejected"));
      return;
    }
    // Any real edit invalidates a Grid-evolution preview built against the old
    // mesh/frame — dismiss it rather than leave a stale overlay on screen.
    ctx.clearGridEvo();
    ctx.documents.documentState = ctx.documents.history.commit(next, label);
    ctx.rememberFailureGenerationState();
    ctx.rebuildEditorIndexes();
    ctx.refresh();
    ctx.syncGenerateControls();
  }
  function restore(next: CityDocument | null): void {
    if (!next) return;
    clearGenerationPreviewCache();
    ctx.documents.lastOutputDocInput = null;
    ctx.documents.lastOutputDocResult = null;
    if (next.frame.extentMeters !== ctx.documents.documentState.frame.extentMeters) {
      ctx.display.halfView = next.frame.extentMeters / 2;
      ctx.display.viewCenter = [0, 0];
      ctx.size.value = sizePresetForExtent(next.frame.extentMeters);
    }
    ctx.documents.documentState = next;
    const playback = ctx.generation.generationHistory.get(ctx.documents.history.currentEntryKey);
    if (playback) {
      ctx.generation.completeSource = playback.source;
      ctx.generation.completeResult = playback.result;
      ctx.generation.completeResultSettings = playback.resultSettings;
      const restoredSettings = clone(playback.settings);
      // Street controls capture this object, so preserve its identity.
      for (const key of Object.keys(ctx.generation.streets))
        delete ctx.generation.streets[key as keyof typeof ctx.generation.streets];
      Object.assign(ctx.generation.streets, restoredSettings.streets);
      for (const key of Object.keys(ctx.generation.generateSettings))
        Reflect.deleteProperty(ctx.generation.generateSettings, key);
      Object.assign(ctx.generation.generateSettings, defaultGenerationSettings(), restoredSettings, {
        streets: ctx.generation.streets,
        buildingHeightPolicy: restoredSettings.buildingHeightPolicy
      });
      ctx.generation.generateSeed = playback.seed;
      ctx.generation.lastGeneratedStep = playback.lastStage;
      ctx.generation.activeStepStage = playback.activeStage;
      ctx.generation.stepIndex = playback.stepIndex;
      ctx.stepStatus.textContent = playback.stepStatus;
      ctx.generation.urbanCoreHighlight = playback.coreHighlight ? new Set(playback.coreHighlight) : null;
      ctx.generation.stepOverlayPaths = playback.overlayPaths ? clone(playback.overlayPaths) : null;
      ctx.display.hideBuildings = playback.hideBuildings;
      ctx.display.hideStreetLines = playback.hideStreetLines;
      ctx.syncStageUi(playback.stage);
    } else {
      const recipe = next.fabric?.generation;
      ctx.generation.generateSettings.mode = recipe?.settings.mode ?? "city";
      ctx.generation.generateSettings.buildingHeightPolicy = next.buildingHeightPolicy;
      ctx.generation.generateSettings.buildingHeightLimit = next.buildingHeightLimit;
      ctx.generation.completeSource = recipe ? clone(recipe.input) : null;
      ctx.generation.completeResult = recipe ? next : null;
      ctx.generation.completeResultSettings = recipe ? JSON.stringify(ctx.generation.generateSettings) : null;
      ctx.generation.lastGeneratedStep = null;
      ctx.generation.activeStepStage = null;
      ctx.generation.stepIndex = -1;
      ctx.stepStatus.textContent = "";
      ctx.generation.urbanCoreHighlight = null;
      ctx.generation.stepOverlayPaths = null;
      ctx.display.hideBuildings = false;
      ctx.display.hideStreetLines = false;
      if (recipe) ctx.generation.generateSeed = recipe.seed;
      ctx.generation.generateSettings.moats = {
        town: next.defenseCircuits?.some(c => c.scope === "town" && c.moat?.enabled) ?? false,
        castle: next.defenseCircuits?.some(c => c.scope === "castle" && c.moat?.enabled) ?? false
      };
      ctx.syncStageUi(next.appearance === "town" ? 16 : 1);
    }
    ctx.generation.generateSettings.buildingHeightPolicy = next.buildingHeightPolicy;
    ctx.generation.generateSettings.buildingHeightLimit = next.buildingHeightLimit;
    ctx.generation.generateSettings.housingAreaScale =
      next.fabric?.generation?.settings.housingAreaScale ?? next.housingAreaScale;
    ctx.generation.generateSettings.housingAreaPasses =
      next.fabric?.generation?.settings.housingAreaPasses ?? next.housingAreaPasses;
    ctx.syncGenerateControls();
    ctx.rebuildEditorIndexes();
    ctx.interaction.selection = emptySelection();
    ctx.interaction.activeGroupId = null;
    ctx.clearGridEvo();
    ctx.refresh();
  }
  return { commit, restore };
}
